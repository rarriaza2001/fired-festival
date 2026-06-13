import { describe, it, expect } from 'vitest';
import { ModelOnlyToolAdapter } from './model-only-tool.adapter';
import type { ToolRequest } from './tool-adapter';

function makeRequest(primitive: ToolRequest['primitive'], query = 'test query'): ToolRequest {
  return { primitive, query };
}

describe('ModelOnlyToolAdapter', () => {
  const adapter = new ModelOnlyToolAdapter();

  it('has name "model_only"', () => {
    expect(adapter.name).toBe('model_only');
  });

  // ---------------------------------------------------------------------------
  // search primitive
  // ---------------------------------------------------------------------------

  describe('invoke with search primitive', () => {
    it('returns available=false', async () => {
      // Arrange
      const request = makeRequest('search', 'market size for widget industry');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.available).toBe(false);
    });

    it('returns evidenceState of external_check_unavailable', async () => {
      // Arrange
      const request = makeRequest('search');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.evidenceState).toBe('external_check_unavailable');
    });

    it('returns null content', async () => {
      // Arrange
      const request = makeRequest('search');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.content).toBeNull();
    });

    it('returns null sourceTrust', async () => {
      // Arrange
      const request = makeRequest('search');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.sourceTrust).toBeNull();
    });

    it('returns costUsd of 0 with exact accuracy', async () => {
      // Arrange
      const request = makeRequest('search');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.costUsd).toBe(0);
      expect(result.costAccuracy).toBe('exact');
    });

    it('returns a non-empty note explaining the limitation', async () => {
      // Arrange
      const request = makeRequest('search');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.note.length).toBeGreaterThan(0);
    });

    it('does not throw', async () => {
      // Arrange
      const request = makeRequest('search');

      // Act & Assert
      await expect(adapter.invoke(request)).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // fetch primitive
  // ---------------------------------------------------------------------------

  describe('invoke with fetch primitive', () => {
    it('returns available=false', async () => {
      // Arrange
      const request = makeRequest('fetch', 'https://example.com/report.pdf');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.available).toBe(false);
    });

    it('returns evidenceState of external_check_unavailable', async () => {
      // Arrange
      const request = makeRequest('fetch');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.evidenceState).toBe('external_check_unavailable');
    });

    it('returns null content', async () => {
      // Arrange
      const request = makeRequest('fetch');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.content).toBeNull();
    });

    it('does not throw', async () => {
      // Arrange
      const request = makeRequest('fetch');

      // Act & Assert
      await expect(adapter.invoke(request)).resolves.not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // ingest primitive
  // ---------------------------------------------------------------------------

  describe('invoke with ingest primitive', () => {
    it('returns available=true', async () => {
      // Arrange
      const request = makeRequest('ingest', 'Q3 revenue was $1.2M');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.available).toBe(true);
    });

    it('returns evidenceState of provided_but_unassessed', async () => {
      // Arrange
      const request = makeRequest('ingest', 'Q3 revenue was $1.2M');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.evidenceState).toBe('provided_but_unassessed');
    });

    it('returns the query as content', async () => {
      // Arrange
      const contextText = 'our TAM is $500B according to internal estimates';
      const request = makeRequest('ingest', contextText);

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.content).toBe(contextText);
    });

    it('returns sourceTrust of unverified', async () => {
      // Arrange
      const request = makeRequest('ingest', 'some context');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.sourceTrust).toBe('unverified');
    });

    it('returns costUsd of 0 with exact accuracy', async () => {
      // Arrange
      const request = makeRequest('ingest', 'context');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.costUsd).toBe(0);
      expect(result.costAccuracy).toBe('exact');
    });

    it('returns a non-empty note', async () => {
      // Arrange
      const request = makeRequest('ingest', 'context');

      // Act
      const result = await adapter.invoke(request);

      // Assert
      expect(result.note.length).toBeGreaterThan(0);
    });

    it('does not throw', async () => {
      // Arrange
      const request = makeRequest('ingest', 'context to ingest');

      // Act & Assert
      await expect(adapter.invoke(request)).resolves.not.toThrow();
    });
  });
});
