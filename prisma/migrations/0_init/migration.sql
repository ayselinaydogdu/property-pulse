-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('RENT', 'SALE');

-- CreateEnum
CREATE TYPE "SourceMethod" AS ENUM ('OBSERVED', 'PUBLISHED_AGGREGATE', 'DERIVED');

-- CreateEnum
CREATE TYPE "GeoScope" AS ENUM ('CITY', 'DISTRICT');

-- CreateEnum
CREATE TYPE "StationStage" AS ENUM ('EXISTING', 'UNDER_CONSTRUCTION');

-- CreateTable
CREATE TABLE "Neighborhood" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'İstanbul',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "polygon" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Neighborhood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentBenchmark" (
    "id" SERIAL NOT NULL,
    "neighborhoodId" INTEGER NOT NULL,
    "rentPerM2" INTEGER NOT NULL,
    "sampleSize" INTEGER,
    "method" "SourceMethod" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "RentBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyListing" (
    "id" SERIAL NOT NULL,
    "neighborhoodId" INTEGER NOT NULL,
    "type" "ListingType" NOT NULL,
    "price" INTEGER NOT NULL,
    "areaM2" INTEGER NOT NULL,
    "rooms" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "method" "SourceMethod" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "externalId" TEXT,

    CONSTRAINT "PropertyListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostOfLivingItem" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "monthlyQty" DOUBLE PRECISION NOT NULL,
    "scope" "GeoScope" NOT NULL,

    CONSTRAINT "CostOfLivingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceEntry" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "neighborhoodId" INTEGER,
    "priceKurus" INTEGER NOT NULL,
    "method" "SourceMethod" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransitStation" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "stage" "StationStage" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "neighborhoodId" INTEGER,
    "method" "SourceMethod" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransitStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusService" (
    "id" SERIAL NOT NULL,
    "neighborhoodId" INTEGER NOT NULL,
    "stops" INTEGER NOT NULL,
    "lines" INTEGER NOT NULL,
    "weekdayDepartures" INTEGER NOT NULL,
    "departuresPerStop" DOUBLE PRECISION NOT NULL,
    "method" "SourceMethod" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentIndexPoint" (
    "id" SERIAL NOT NULL,
    "series" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "method" "SourceMethod" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentIndexPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Neighborhood_slug_key" ON "Neighborhood"("slug");

-- CreateIndex
CREATE INDEX "Neighborhood_city_district_idx" ON "Neighborhood"("city", "district");

-- CreateIndex
CREATE INDEX "RentBenchmark_neighborhoodId_idx" ON "RentBenchmark"("neighborhoodId");

-- CreateIndex
CREATE UNIQUE INDEX "RentBenchmark_neighborhoodId_source_retrievedAt_key" ON "RentBenchmark"("neighborhoodId", "source", "retrievedAt");

-- CreateIndex
CREATE INDEX "PropertyListing_neighborhoodId_type_idx" ON "PropertyListing"("neighborhoodId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyListing_source_externalId_key" ON "PropertyListing"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CostOfLivingItem_slug_key" ON "CostOfLivingItem"("slug");

-- CreateIndex
CREATE INDEX "PriceEntry_neighborhoodId_itemId_idx" ON "PriceEntry"("neighborhoodId", "itemId");

-- CreateIndex
CREATE INDEX "TransitStation_neighborhoodId_stage_idx" ON "TransitStation"("neighborhoodId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "BusService_neighborhoodId_key" ON "BusService"("neighborhoodId");

-- CreateIndex
CREATE INDEX "RentIndexPoint_series_periodStart_idx" ON "RentIndexPoint"("series", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "RentIndexPoint_series_period_key" ON "RentIndexPoint"("series", "period");

-- AddForeignKey
ALTER TABLE "RentBenchmark" ADD CONSTRAINT "RentBenchmark_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyListing" ADD CONSTRAINT "PropertyListing_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceEntry" ADD CONSTRAINT "PriceEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CostOfLivingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceEntry" ADD CONSTRAINT "PriceEntry_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitStation" ADD CONSTRAINT "TransitStation_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusService" ADD CONSTRAINT "BusService_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

