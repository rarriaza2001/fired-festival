import { describe, expect, it } from 'vitest';
import { buildContextTriagePrompt } from './context-triage-prompts';

describe('buildContextTriagePrompt', () => {
  it('includes danger context and ingested excerpts', () => {
    const prompt = buildContextTriagePrompt(
      { text: 'Should I open a cafe?', context_items: [] },
      [
        {
          label: 'Pitch deck',
          kind: 'pptx',
          ref: 'attachment://id',
          status: 'parsed',
          extracted_text: 'Revenue will grow 10x',
          excerpt: 'Revenue will grow',
          char_count: 20,
          warnings: ['Slides summarize at a high level'],
        },
      ],
    );
    expect(prompt.user).toContain('Should I open a cafe?');
    expect(prompt.user).toContain('NOT verified as evidence');
    expect(prompt.user).toContain('Revenue will grow');
    expect(prompt.system).toContain('NOT automatically credible');
  });
});
