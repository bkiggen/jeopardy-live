-- Create teams table
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

-- Seed a default team so existing players + scores have somewhere to land
INSERT INTO "teams" ("name", "code", "is_active") VALUES ('Default', 'MAIN', true);

-- Add team_id columns nullable for backfill
ALTER TABLE "players" ADD COLUMN "team_id" INTEGER;
ALTER TABLE "season_scores" ADD COLUMN "team_id" INTEGER;

-- Backfill onto the default team (id=1, freshly inserted above)
UPDATE "players" SET "team_id" = (SELECT id FROM "teams" WHERE "code" = 'MAIN');
UPDATE "season_scores" SET "team_id" = (SELECT id FROM "teams" WHERE "code" = 'MAIN');

-- Lock down: NOT NULL + foreign keys
ALTER TABLE "players" ALTER COLUMN "team_id" SET NOT NULL;
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "season_scores" ALTER COLUMN "team_id" SET NOT NULL;
ALTER TABLE "season_scores" ADD CONSTRAINT "season_scores_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace old unique constraint with team-aware one
ALTER TABLE "season_scores" DROP CONSTRAINT IF EXISTS "season_scores_player_id_season_id_key";
DROP INDEX IF EXISTS "season_scores_player_id_season_id_key";
CREATE UNIQUE INDEX "season_scores_player_id_season_id_team_id_key" ON "season_scores"("player_id", "season_id", "team_id");
