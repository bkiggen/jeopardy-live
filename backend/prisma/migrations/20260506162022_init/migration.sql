-- CreateTable
CREATE TABLE "seasons" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_scores" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "total_score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "season_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clues" (
    "id" SERIAL NOT NULL,
    "show_number" INTEGER,
    "air_date" DATE,
    "round" VARCHAR(50),
    "category" VARCHAR(255),
    "value" INTEGER,
    "question" TEXT,
    "answer" TEXT,

    CONSTRAINT "clues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "season_scores_player_id_season_id_key" ON "season_scores"("player_id", "season_id");

-- CreateIndex
CREATE INDEX "clues_round_category_idx" ON "clues"("round", "category");

-- AddForeignKey
ALTER TABLE "season_scores" ADD CONSTRAINT "season_scores_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_scores" ADD CONSTRAINT "season_scores_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
