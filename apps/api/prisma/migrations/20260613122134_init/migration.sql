-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "inputText" TEXT NOT NULL,
    "contextItems" TEXT NOT NULL DEFAULT '[]',
    "mode" TEXT,
    "reviewState" TEXT NOT NULL,
    "terminalState" TEXT,
    "stopReason" TEXT,
    "outputJson" TEXT
);

-- CreateTable
CREATE TABLE "TraceEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT 'phase8.v1',
    "runId" TEXT NOT NULL,
    "parentEventId" TEXT,
    "eventName" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "stage" TEXT,
    "reviewState" TEXT,
    "terminalState" TEXT,
    "durationMs" REAL,
    "costUsd" REAL,
    "model" TEXT,
    "toolName" TEXT,
    "searchDepth" TEXT,
    "loopCount" INTEGER,
    "guardrailCategory" TEXT,
    "confidenceBefore" TEXT,
    "confidenceAfter" TEXT,
    "evalResult" TEXT,
    "errorType" TEXT,
    "errorSeverity" TEXT,
    "stopReason" TEXT,
    "details" TEXT NOT NULL DEFAULT '{}',
    "visibility" TEXT NOT NULL DEFAULT 'internal_only',
    CONSTRAINT "TraceEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StateTransition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    CONSTRAINT "StateTransition_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "extractionConfidence" TEXT NOT NULL,
    "inferredReframe" TEXT,
    CONSTRAINT "Artifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvalResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "evaluatorType" TEXT NOT NULL,
    "humanReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Metric" (
    "runId" TEXT NOT NULL PRIMARY KEY,
    "durationMs" REAL NOT NULL,
    "terminalState" TEXT NOT NULL,
    "stopReason" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "loopCount" INTEGER NOT NULL DEFAULT 0,
    "maxLoopReached" BOOLEAN NOT NULL DEFAULT false,
    "clarificationCount" INTEGER NOT NULL DEFAULT 0,
    "searchDepth" TEXT NOT NULL DEFAULT 'no_search',
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "finalReviewConfidence" TEXT,
    "evalResult" TEXT,
    "guardrailTriggerCount" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" REAL,
    "costAccuracy" TEXT NOT NULL DEFAULT 'unknown',
    CONSTRAINT "Metric_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Review_reviewState_idx" ON "Review"("reviewState");

-- CreateIndex
CREATE INDEX "Review_terminalState_idx" ON "Review"("terminalState");

-- CreateIndex
CREATE UNIQUE INDEX "TraceEvent_eventId_key" ON "TraceEvent"("eventId");

-- CreateIndex
CREATE INDEX "TraceEvent_runId_id_idx" ON "TraceEvent"("runId", "id");

-- CreateIndex
CREATE INDEX "TraceEvent_runId_visibility_idx" ON "TraceEvent"("runId", "visibility");

-- CreateIndex
CREATE INDEX "TraceEvent_eventName_idx" ON "TraceEvent"("eventName");

-- CreateIndex
CREATE INDEX "StateTransition_runId_id_idx" ON "StateTransition"("runId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Artifact_runId_key" ON "Artifact"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalResult_runId_key" ON "EvalResult"("runId");
