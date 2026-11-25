-- Phase 2B: general event categories. Reference data only; no schema change.
-- Additive and idempotent: existing categories (the cybersecurity set) and event records are not
-- changed, and rows that already exist by slug or name are skipped.
-- Rollback (manual, only while no event uses them):
--   DELETE FROM "event_categories" WHERE "slug" IN ('technology-ai', 'business-entrepreneurship',
--     'education', 'engineering-science', 'community-networking', 'career-development', 'other')
--     AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."category_id" = "event_categories"."id");

INSERT INTO "event_categories" ("id", "slug", "name", "description", "sort_order") VALUES
  (gen_random_uuid(), 'technology-ai', 'Technology & AI', 'Software, data, artificial intelligence and emerging technology.', 200),
  (gen_random_uuid(), 'business-entrepreneurship', 'Business & Entrepreneurship', 'Startups, leadership, finance, marketing and growth.', 210),
  (gen_random_uuid(), 'education', 'Education', 'Teaching, learning, academic and student events.', 220),
  (gen_random_uuid(), 'engineering-science', 'Engineering & Science', 'Engineering disciplines, research and the sciences.', 230),
  (gen_random_uuid(), 'community-networking', 'Community & Networking', 'Meetups, community gatherings and networking.', 240),
  (gen_random_uuid(), 'career-development', 'Career & Professional Development', 'Careers, mentoring, skills and professional growth.', 250),
  (gen_random_uuid(), 'other', 'Other', 'Events that do not fit another category.', 900)
ON CONFLICT DO NOTHING;
