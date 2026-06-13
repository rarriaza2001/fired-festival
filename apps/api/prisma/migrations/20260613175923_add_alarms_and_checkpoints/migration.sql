-- CreateTable
CREATE TABLE "Alarm" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alarm_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Checkpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Alarm_runId_id_idx" ON "Alarm"("runId", "id");

-- CreateIndex
CREATE INDEX "Checkpoint_runId_seq_idx" ON "Checkpoint"("runId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Checkpoint_runId_seq_key" ON "Checkpoint"("runId", "seq");
