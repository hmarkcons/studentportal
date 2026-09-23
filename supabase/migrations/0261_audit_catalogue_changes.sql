-- Record who changed a university or a programme, and what it was before.
--
-- The catalogue imports now overwrite rather than skip. One upload can rewrite
-- the tuition fee, the language requirement and the intake dates of four
-- hundred programmes, and until now nothing anywhere would have said so: the
-- generic audit trigger from 0006 covers staff, leads and
-- program_commission_rates, and was never attached to these three tables.
--
-- Which mattered less while the only way to change a programme was the edit
-- form, one field at a time, by somebody looking at it. It matters now. A fee
-- that is wrong on an invoice traces back to a row in a spreadsheet somebody
-- uploaded last month, and without this there is no way back to it.
--
-- log_audit_event() writes the whole row before and after into audit_log, so
-- this is also the only undo that exists for an import — not automatic, but
-- the old values are there to read.

-- program_intake_rounds as well as the two obvious tables: replacing a
-- programme's rounds is a delete and re-insert, so the dates a student was
-- told about can vanish with nothing left pointing at who removed them.
drop trigger if exists trg_audit_universities on public.universities;
create trigger trg_audit_universities
  after insert or update or delete on public.universities
  for each row execute function public.log_audit_event();

drop trigger if exists trg_audit_programs on public.programs;
create trigger trg_audit_programs
  after insert or update or delete on public.programs
  for each row execute function public.log_audit_event();

drop trigger if exists trg_audit_program_intake_rounds on public.program_intake_rounds;
create trigger trg_audit_program_intake_rounds
  after insert or update or delete on public.program_intake_rounds
  for each row execute function public.log_audit_event();

-- A seeding migration inserts a thousand programmes in one statement and would
-- write a thousand audit rows with it. That is the correct reading of what
-- happened, and audit_log is append-only and cheap, so it is left alone rather
-- than special-cased — a rule with an exception for bulk writes would exempt
-- exactly the case this exists for.
--
-- The index is what keeps reading it back per-entity fast once those rows are
-- in; audit_log has only had a primary key until now.
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);
