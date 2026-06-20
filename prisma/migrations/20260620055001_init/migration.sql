/*
  Warnings:

  - A unique constraint covering the columns `[googleId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DmcaStatus" AS ENUM ('OPEN', 'COUNTERED', 'RESOLVED_REMOVED', 'RESOLVED_RESTORED');

-- CreateEnum
CREATE TYPE "GrantSource" AS ENUM ('PURCHASE', 'SWAP', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'PRO', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SWAP_OFFER';
ALTER TYPE "NotificationType" ADD VALUE 'SWAP_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'SWAP_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'QUOTA_LOW';
ALTER TYPE "NotificationType" ADD VALUE 'SUB_ACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE 'PRICE_DROP';
ALTER TYPE "NotificationType" ADD VALUE 'DMCA';

-- AlterEnum
ALTER TYPE "PhotoStatus" ADD VALUE 'DMCA_HOLD';

-- DropForeignKey
ALTER TABLE "DownloadGrant" DROP CONSTRAINT "DownloadGrant_orderItemId_fkey";

-- AlterTable
ALTER TABLE "DownloadGrant" ADD COLUMN     "source" "GrantSource" NOT NULL DEFAULT 'PURCHASE',
ADD COLUMN     "swapOfferId" TEXT,
ALTER COLUMN "orderItemId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingSum" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "penaltyPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "planRenewsAt" TIMESTAMP(3),
ADD COLUMN     "planType" "PlanType" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "quotaResetAt" TIMESTAMP(3),
ADD COLUMN     "quotaUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingSum" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SwapOffer" (
    "id" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "offeredPhotoId" TEXT NOT NULL,
    "requestedPhotoId" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" "SwapStatus" NOT NULL DEFAULT 'PENDING',
    "suggestedTopUpVnd" INTEGER NOT NULL DEFAULT 0,
    "initiatorConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "responderConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwapOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "priceVnd" INTEGER NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "providerTxnRef" TEXT,
    "startedAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmcaClaim" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '',
    "status" "DmcaStatus" NOT NULL DEFAULT 'OPEN',
    "counterStatement" TEXT,
    "deadline" TIMESTAMP(3) NOT NULL,
    "counteredAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmcaClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "priceAtAdd" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SwapOffer_responderId_status_idx" ON "SwapOffer"("responderId", "status");

-- CreateIndex
CREATE INDEX "SwapOffer_initiatorId_status_idx" ON "SwapOffer"("initiatorId", "status");

-- CreateIndex
CREATE INDEX "SwapOffer_status_idx" ON "SwapOffer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerTxnRef_key" ON "Subscription"("providerTxnRef");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Review_sellerId_idx" ON "Review"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_photoId_buyerId_key" ON "Review"("photoId", "buyerId");

-- CreateIndex
CREATE INDEX "DmcaClaim_status_idx" ON "DmcaClaim"("status");

-- CreateIndex
CREATE INDEX "DmcaClaim_photoId_idx" ON "DmcaClaim"("photoId");

-- CreateIndex
CREATE INDEX "WishlistItem_photoId_idx" ON "WishlistItem"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_userId_photoId_key" ON "WishlistItem"("userId", "photoId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- AddForeignKey
ALTER TABLE "DownloadGrant" ADD CONSTRAINT "DownloadGrant_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapOffer" ADD CONSTRAINT "SwapOffer_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapOffer" ADD CONSTRAINT "SwapOffer_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapOffer" ADD CONSTRAINT "SwapOffer_offeredPhotoId_fkey" FOREIGN KEY ("offeredPhotoId") REFERENCES "Photo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapOffer" ADD CONSTRAINT "SwapOffer_requestedPhotoId_fkey" FOREIGN KEY ("requestedPhotoId") REFERENCES "Photo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmcaClaim" ADD CONSTRAINT "DmcaClaim_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmcaClaim" ADD CONSTRAINT "DmcaClaim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
