-- The first discipline a core_field names is the programme's field.
--
-- 0243's classifier scans for discipline words anywhere in the string, which
-- misreads any core_field that describes a programme by listing what it draws
-- on. The one that surfaced it: a master's called "Quantitative Biology" whose
-- core_field is
--
--   "Biology integrated with physics, mathematics, chemistry and computer science"
--
-- It was filed under Computer Science & IT, and so appeared in the suggestions
-- for a student who had asked for computing — a biology degree offered to
-- somebody who did not ask for biology. The classification is not merely
-- untidy there; it is the thing driving what staff get recommended.
--
-- So a leading-term pass runs first: when a core_field BEGINS with an
-- unambiguous discipline, that wins over anything mentioned later. Only
-- prefixes that admit no other reading are listed — "biology..." is a biology
-- programme, but "applied..." or "advanced..." say nothing, and a word that
-- can lead a different discipline's name is left out entirely.

create or replace function public.classify_core_field(raw text)
returns text
language sql
immutable
as $$
  with t as (select lower(btrim(coalesce(raw, ''))) as s),
  lead_term as (
    select case
      -- Health. "dental"/"veterinar" before "medic" so "Dental Medicine" and
      -- "Veterinary Medicine" are not read as Medicine.
      when s ~ '^(dental|dentist|odonto)'          then 'dentistry'
      when s ~ '^(veterinar)'                      then 'veterinary'
      when s ~ '^(pharmac)'                        then 'pharmacy'
      when s ~ '^(nursing|nurse|midwif|physiotherap|dietet)' then 'nursing_allied'
      when s ~ '^(medicine|medical scien|general medicine|surgery)' then 'medicine'
      -- Sciences. These are the ones that were being lost.
      when s ~ '^(biolog|biotechnolog|microbiolog|biochem|molecular biolog|zoolog|botan)' then 'life_sciences'
      when s ~ '^(chemistry|chemical scien)'       then 'chemistry'
      when s ~ '^(physics|astronom|astrophys)'     then 'physics'
      when s ~ '^(mathemat|statistic)'             then 'mathematics'
      when s ~ '^(geolog|geograph|geoscien|earth scien)' then 'earth_environment'
      -- Computing, stated as itself rather than as an ingredient.
      when s ~ '^(computer scien|computer engineer|informatic|software)' then 'computer_science'
      when s ~ '^(artificial intelligence|data scien|machine learning)' then 'data_ai'
      -- Society and humanities.
      when s ~ '^(law|legal)'                      then 'law'
      when s ~ '^(econom)'                         then 'economics_finance'
      when s ~ '^(psycholog)'                      then 'psychology'
      when s ~ '^(sociolog|politic|international relation)' then 'social_sciences'
      when s ~ '^(histor|philosoph|linguist|philolog|archaeolog|theolog)' then 'humanities'
      when s ~ '^(music|conducting|singing)'       then 'music_performing'
      when s ~ '^(architect)'                      then 'architecture'
      when s ~ '^(agricultur|horticultur)'         then 'agriculture_food'
      when s ~ '^(tourism|hospitality)'            then 'tourism_hospitality'
      when s ~ '^(sport)'                          then 'sport'
      else null
    end as g
    from t
  )
  select coalesce(
    (select g from lead_term),
    (select case
      -- ---------------------------------------------------------------- health
      when s ~ 'dental|dentist|odonto'                                     then 'dentistry'
      when s ~ 'pharmac|pharmaz'                                           then 'pharmacy'
      when s ~ 'veterinar'                                                 then 'veterinary'
      when s ~ 'nursing|nurse|midwif|physiotherap|occupational therap|radiograph|optometr|dietet|nutrition|speech therap|paramedic'
                                                                           then 'nursing_allied'
      when s ~ 'public health|health management|health care management|health economic|epidemiolog|health tourism|health promotion'
                                                                           then 'public_health'
      when s ~ '(biomedical|biochemical|bioprocess|biosystems|tissue|genetic).*(engineer)'
                                                                           then 'eng_chemical'
      when s ~ 'medicine|medical|surgery|physician|clinical|anatom|patholog|immunolog|neurosci|psychiatr|radiolog|cardio'
                                                                           then 'medicine'
      -- ------------------------------------------------------------- computing
      when s ~ 'artificial intelligence|machine learning|data scien|big data|data analyt|business analytic'
                                                                           then 'data_ai'
      when s ~ 'computer|informatic|software|cyber|information technolog|computing|network|game develop|web develop'
                                                                           then 'computer_science'
      -- ----------------------------------------------------------- engineering
      when s ~ 'aerospace|aeronaut|aviation|astronaut|space engineer|pilot'  then 'eng_aerospace'
      when s ~ 'mechanical|automotive|mechatron|vehicle|motorsport|manufactur|robotic|marine engineer|naval'
                                                                           then 'eng_mechanical'
      when s ~ 'electric|electron|power engineer|telecommunic|control engineer|automation'
                                                                           then 'eng_electrical'
      when s ~ 'civil|structural|construction|geodes|surveying|infrastructur|transport engineer|railway'
                                                                           then 'eng_civil'
      when s ~ 'chemical engineer|materials|metallurg|polymer|petroleum|mining|process engineer'
                                                                           then 'eng_chemical'
      when s ~ 'industrial engineer|logistic|supply chain|engineering management|engineering manager|systems engineer|quality engineer'
                                                                           then 'eng_industrial'
      when s ~ 'architect|urban|landscape|interior design|built environment|spatial plan'
                                                                           then 'architecture'
      when s ~ 'agricultur|horticultur|animal husband|animal scien|animal nutrition|crop|plant protect|plant scien|food scien|food technolog|food safety|food engineer|viticultur|oenolog|aquacultur|fisher|wildlife|forest|soil'
                                                                           then 'agriculture_food'
      when s ~ 'engineer'                                                  then 'eng_other'
      when s ~ 'environment|ecolog|climate|geolog|geograph|geoscien|geomat|geoinformat|planetary|earth scien|earth and|earth/|atmospher|meteorol|hydro|water|marine scien|oceanogra|sustainab|renewable|energy|aquatic'
                                                                           then 'earth_environment'
      when s ~ 'biotechnolog|biolog|biochem|microbiol|molecular|genetic|biophysic|bioinformat|life scien|zoolog|botan'
                                                                           then 'life_sciences'
      when s ~ 'chemis|chimic'                                             then 'chemistry'
      when s ~ 'physic|astronom|astrophys|cosmolog|nuclear|photonic|optic|quantum'
                                                                           then 'physics'
      when s ~ 'mathemat|statistic|actuarial'                              then 'mathematics'
      when s ~ 'finance|accounting|audit|banking|insurance|invest'          then 'economics_finance'
      when s ~ 'econom'                                                    then 'economics_finance'
      when s ~ 'marketing|advertis|brand|commerce|retail|sales'            then 'business'
      when s ~ 'business|management|mba|entrepreneur|human resource|project management|administration|leadership|organisation|organization'
                                                                           then 'business'
      when s ~ 'tourism|hospitality|hotel|catering|event manage|leisure'   then 'tourism_hospitality'
      when s ~ '\mlaw\M|legal|jurisprud|llm|criminolog'                    then 'law'
      when s ~ 'psycholog'                                                 then 'psychology'
      when s ~ 'educat|teaching|pedagog|didactic|instruction of'           then 'education'
      when s ~ 'politic|international relation|sociolog|social work|social scien|public policy|public governance|public administration|development studies|anthropol|security studies|diplomac'
                                                                           then 'social_sciences'
      when s ~ 'music|conducting|singing|instrument|orchestr|opera'        then 'music_performing'
      when s ~ 'theatre|theater|dance|performing|film|cinema|animation|photograph|graphic|design|fine art|visual art|fashion|media|journalis|communicat|advertising'
                                                                           then 'arts_media'
      when s ~ 'histor|philosoph|literature|linguist|language|philolog|classic|archaeolog|theolog|religio|cultural|humanit|studies'
                                                                           then 'humanities'
      when s ~ 'sport|coaching|kinesiolog|physical educat|recreation'      then 'sport'
      when s ~ 'cognitive scien'                                           then 'psychology'
      when s ~ 'nanotech|nanoscien'                                        then 'eng_chemical'
      when s ~ 'translation|interpreting'                                  then 'humanities'
      when s ~ 'health scien|health research'                              then 'nursing_allied'
      when s ~ 'labor relation|labour relation'                            then 'social_sciences'
      when s = 'cs'                                                        then 'computer_science'
      when s in ('science', 'sciences', 'natural science', 'natural sciences',
                 'computational / natural sciences', 'arts and sciences (multiple departments)',
                 'transdisciplinary art and science')                      then 'natural_sciences'
      else null
    end from t)
  );
$$;

-- Re-classify everything with the improved rules. The trigger applies the same
-- 'other' fallback on the way in; this keeps stored rows in step with it.
update public.programs
   set field_group = case
     when core_field is null or btrim(core_field) = '' then null
     else coalesce(public.classify_core_field(core_field), 'other')
   end
 where field_group is distinct from case
     when core_field is null or btrim(core_field) = '' then null
     else coalesce(public.classify_core_field(core_field), 'other')
   end;
