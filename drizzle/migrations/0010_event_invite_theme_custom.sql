ALTER TABLE "events" ADD COLUMN "theme" jsonb;--> statement-breakpoint
UPDATE "events" SET "theme" = CASE "palette"
  WHEN 'toscana' THEN '{"paper":"#FFFDF6","accent":"#d4a373","deep":"#5E4426","onAccent":"#3F3622"}'::jsonb
  WHEN 'bordeaux' THEN '{"paper":"#FBF6F4","accent":"#8C3B4A","deep":"#4A2230","onAccent":"#FBF6F4"}'::jsonb
  WHEN 'salvia' THEN '{"paper":"#F7F8F1","accent":"#7E8C5A","deep":"#3F4A2C","onAccent":"#F7F8F1"}'::jsonb
  WHEN 'polvere' THEN '{"paper":"#F5F7F9","accent":"#6E8AA6","deep":"#324558","onAccent":"#F5F7F9"}'::jsonb
  WHEN 'terracotta' THEN '{"paper":"#FBF4F0","accent":"#C2683F","deep":"#6E3318","onAccent":"#FBF4F0"}'::jsonb
  WHEN 'notte' THEN '{"paper":"#F3F2F0","accent":"#3F3622","deep":"#1E1A12","onAccent":"#F3F2F0"}'::jsonb
  ELSE "theme" END
WHERE "palette" IS NOT NULL;--> statement-breakpoint
UPDATE "events" SET "invite_font" = CASE "invite_font"
  WHEN 'bricolage' THEN 'Bricolage Grotesque'
  WHEN 'playfair' THEN 'Playfair Display'
  WHEN 'cormorant' THEN 'Cormorant Garamond'
  WHEN 'garamond' THEN 'EB Garamond'
  WHEN 'baskerville' THEN 'Libre Baskerville'
  ELSE "invite_font" END
WHERE "invite_font" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "palette";
