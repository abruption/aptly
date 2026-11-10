/** Public documentation paths; keep npm topic exposure explicit and bounded. */
export const guideLocales = ['ko','en','zh-CN','ja'] as const;
export const guideTopics = ['installation','configuration','routing','transmission','budget','statistics','troubleshooting','advanced','benchmarks'] as const;
export const guideLandingFiles = guideLocales.map(locale=>`docs/guide/${locale}.md`);
export const guideTopicFiles = guideLocales.flatMap(locale=>guideTopics.map(topic=>`docs/guide/${locale}/${topic}.md`));
export const guideFiles = [...guideLandingFiles,...guideTopicFiles];
