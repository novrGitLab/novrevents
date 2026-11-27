ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CONCERT';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'FESTIVAL';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'EXHIBITION';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CELEBRATION';

INSERT INTO "event_categories" ("id", "slug", "name", "description", "sort_order") VALUES
(gen_random_uuid(), 'music-nightlife', 'Music & Nightlife', 'Live performances, listening parties, club nights and festivals.', 260),
(gen_random_uuid(), 'arts-culture', 'Arts & Culture', 'Exhibitions, film, theatre, design and creative workshops.', 270),
(gen_random_uuid(), 'food-drink', 'Food & Drink', 'Tastings, supper clubs, culinary workshops and food festivals.', 280),
(gen_random_uuid(), 'celebrations', 'Celebrations', 'Weddings, anniversaries, reunions and personal occasions.', 290)
ON CONFLICT DO NOTHING;
