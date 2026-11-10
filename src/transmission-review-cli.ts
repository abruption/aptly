import {prepareTransmissionReview,type SetupOptions,type SetupResult} from './setup.ts';
import {canPromptTransmission,readTransmissionReviewChoice,type TransmissionPromptCandidate,type TransmissionReviewChoice} from './cli-input.ts';

interface ReviewDependencies {
  interactive?:boolean;
  readChoice?:(candidates:readonly TransmissionPromptCandidate[])=>Promise<TransmissionReviewChoice>;
}
/** CLI-only orchestration: never called by MCP, Hooks, updater or read-only commands. */
export async function runTransmissionReview(options:SetupOptions={},forceReview=false,dependencies:ReviewDependencies={}):Promise<SetupResult> {
  const interactive=dependencies.interactive??canPromptTransmission();
  if(forceReview&&!interactive)throw new Error('set_interactive_input_required');
  const prepared=prepareTransmissionReview({...options,forceReview});
  if(prepared.result.status!=='complete'||!prepared.candidates.length||!interactive)return prepared.result;
  const choice=await(dependencies.readChoice??readTransmissionReviewChoice)(prepared.candidates);
  return prepared.apply(choice);
}

/** Preserve the completed base setup result while exposing the separate review outcome. */
export async function reviewAfterSetup(base:SetupResult,options:SetupOptions={},dependencies:ReviewDependencies={}):Promise<SetupResult> {
  if(base.status!=='complete')return base;
  const clients=base.clients.filter(c=>c.status==='configured'||c.status==='unchanged').map(c=>c.client);
  if(!clients.length)return base;
  const review=await runTransmissionReview({...options,clients},false,dependencies);
  return {status:review.status==='partial'?'partial':base.status,clients:base.clients.map(previous=>{
    const next=review.clients.find(c=>c.client===previous.client);if(!next)return previous;
    let codes=[...new Set([...previous.codes,...next.codes])];
    if(next.transmission_review==='complete')codes=codes.filter(c=>c!=='transmission_review_required');
    if(next.transmission!==undefined&&next.transmission!=='unselected')codes=codes.filter(c=>c!=='transmission_selection_required');
    if(next.transmission_source!==undefined&&next.transmission_source!=='legacy')codes=codes.filter(c=>c!=='legacy_transmission_excerpt');
    return {...previous,...next,status:next.status==='unchanged'?previous.status:next.status,codes};
  })};
}
