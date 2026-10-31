-- CreateTable
CREATE TABLE `Incident` (
    `id` VARCHAR(191) NOT NULL,
    `incidentNumber` VARCHAR(50) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `priority` ENUM('P1', 'P2', 'P3', 'P4') NOT NULL DEFAULT 'P3',
    `status` ENUM('NEW', 'TRIAGED', 'ASSIGNED', 'INVESTIGATING', 'REMEDIATING', 'VERIFYING', 'RESOLVED', 'CLOSED', 'REJECTED', 'REOPENED', 'ESCALATED') NOT NULL DEFAULT 'NEW',
    `category` VARCHAR(100) NOT NULL,
    `tags` JSON NULL,
    `reportedById` VARCHAR(191) NOT NULL,
    `assignedToId` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Incident_incidentNumber_key`(`incidentNumber`),
    INDEX `Incident_status_idx`(`status`),
    INDEX `Incident_severity_idx`(`severity`),
    INDEX `Incident_priority_idx`(`priority`),
    INDEX `Incident_reportedById_idx`(`reportedById`),
    INDEX `Incident_assignedToId_idx`(`assignedToId`),
    INDEX `Incident_createdAt_idx`(`createdAt`),
    INDEX `Incident_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncidentAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `incidentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'PRIMARY_RESPONDER',
    `assignedById` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unassignedAt` DATETIME(3) NULL,

    INDEX `IncidentAssignment_incidentId_isActive_idx`(`incidentId`, `isActive`),
    INDEX `IncidentAssignment_userId_isActive_idx`(`userId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncidentHistory` (
    `id` VARCHAR(191) NOT NULL,
    `incidentId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(100) NOT NULL,
    `fromStatus` ENUM('NEW', 'TRIAGED', 'ASSIGNED', 'INVESTIGATING', 'REMEDIATING', 'VERIFYING', 'RESOLVED', 'CLOSED', 'REJECTED', 'REOPENED', 'ESCALATED') NULL,
    `toStatus` ENUM('NEW', 'TRIAGED', 'ASSIGNED', 'INVESTIGATING', 'REMEDIATING', 'VERIFYING', 'RESOLVED', 'CLOSED', 'REJECTED', 'REOPENED', 'ESCALATED') NULL,
    `notes` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IncidentHistory_incidentId_createdAt_idx`(`incidentId`, `createdAt`),
    INDEX `IncidentHistory_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Investigation` (
    `id` VARCHAR(191) NOT NULL,
    `incidentId` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `summary` TEXT NULL,
    `hypotheses` JSON NULL,
    `findings` TEXT NULL,
    `rootCause` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `concludedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Investigation_incidentId_key`(`incidentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Incident` ADD CONSTRAINT `Incident_reportedById_fkey` FOREIGN KEY (`reportedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Incident` ADD CONSTRAINT `Incident_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncidentAssignment` ADD CONSTRAINT `IncidentAssignment_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `Incident`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncidentAssignment` ADD CONSTRAINT `IncidentAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncidentAssignment` ADD CONSTRAINT `IncidentAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncidentHistory` ADD CONSTRAINT `IncidentHistory_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `Incident`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncidentHistory` ADD CONSTRAINT `IncidentHistory_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Investigation` ADD CONSTRAINT `Investigation_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `Incident`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Investigation` ADD CONSTRAINT `Investigation_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
