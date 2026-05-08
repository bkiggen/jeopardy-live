-- Single-row settings table. id is hard-pinned to 1 so we can upsert
-- without juggling identifiers from the application.
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "money_burning_mode" BOOLEAN NOT NULL DEFAULT false,
    "voice" VARCHAR(40) NOT NULL DEFAULT 'daniel',
    "buzz_answer_seconds" INTEGER NOT NULL DEFAULT 10,
    "final_answer_seconds" INTEGER NOT NULL DEFAULT 30,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "app_settings_singleton" CHECK ("id" = 1)
);

-- Seed the singleton row with defaults.
INSERT INTO "app_settings" ("id") VALUES (1);
