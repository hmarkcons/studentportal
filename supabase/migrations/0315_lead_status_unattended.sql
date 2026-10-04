-- "Unattended": a lead nobody has worked yet.
--
-- A new lead used to start as Potential, which said something about the lead
-- before anybody had spoken to them, and left a lead that had been called and
-- judged promising looking exactly like one nobody had touched. From 0316 a
-- lead added by hand, or imported with a blank Status, starts as Unattended
-- until a counsellor moves it on.
--
-- On its own, because a value added to an enum cannot be used — as a column
-- default, or in a function body that names it — until the transaction that
-- added it has committed, and the migration runner sends each file as one.
-- 0316 makes it the default and checks this ran first.

alter type lead_status add value if not exists 'unattended' before 'potential';
