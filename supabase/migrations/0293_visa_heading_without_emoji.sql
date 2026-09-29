-- The approved-visa heading without its emoji.
--
-- The portal draws its icons now (lucide) and uses no emoji anywhere. 0177
-- seeded the heading a student reads when their visa arrives as
-- "🎉 Your visa has been issued", and the Visa page puts a party-popper icon
-- beside that heading itself, so the stored one would show twice.
--
-- Only a heading that starts with the seeded emoji is touched, in the shared
-- wording and in any country's override: whatever else the office has written
-- since is theirs.

update public.visa_messages
set approved_heading = btrim(regexp_replace(approved_heading, '^🎉\s*', '')),
    updated_at = now()
where approved_heading like '🎉%';

update public.visa_destination_messages
set approved_heading = btrim(regexp_replace(approved_heading, '^🎉\s*', '')),
    updated_at = now()
where approved_heading like '🎉%';
