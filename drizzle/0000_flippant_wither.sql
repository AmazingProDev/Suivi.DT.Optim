CREATE TABLE `action_updates` (
	`source_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'Non renseigné' NOT NULL,
	`priority` text DEFAULT 'À évaluer' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`validation` text DEFAULT 'Non renseignée' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
