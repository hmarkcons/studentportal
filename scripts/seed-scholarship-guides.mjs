// The fourteen Italian scholarship guides, from the PDFs in
// reference/Scholarship Regions.
//
// Content rather than schema, so it lives in a re-runnable script instead of a
// migration: these guides are edited in the app from the day they land, and a
// migration that rewrote them would undo whoever had corrected one. Run it
// again only to re-seed a body that has not been touched, or a fresh database.
//
// Matched to bodies by name. Anything already on the row and not named here —
// covers, region, the country links — is left exactly as it is.
//
//   node scripts/seed-scholarship-guides.mjs          # what it would change
//   node scripts/seed-scholarship-guides.mjs --apply  # change it

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"\r?$/g, "").trim()];
    })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const s = (title, body) => ({ title, body });

export const GUIDES = [
  {
    match: "ADiSURC",
    academic_year: "2026/2027",
    application_deadline: "23 September 2025, 12:00",
    apply_url: "https://www.adisurcampania.it",
    source_url: "https://www.adisurcampania.it",
    sections: [
      s("Important deadline", "12:00 · 23 September 2025.\nOnline submission only, through the Students' Reserved Area. No extensions.\n\nNOTE — the source guide gives a 2025 deadline under an A.Y. 2026/2027 heading, and a 2024 income year where the other 2026/2027 calls use 2025. Verify both against the official ADiSURC call before advising a student."),
      s("Eligible universities", "University of Sannio in Benevento\nUniversity of Naples Federico II\nUniversity of Naples \"L'Orientale\"\nUniversity of Naples \"Parthenope\"\nUniversity of Salerno\nUniversity of Campania Luigi Vanvitelli\nUniversity of Naples \"Suor Orsola Benincasa\""),
      s("How to apply", "Completed exclusively online on the ADiSURC website, through the Students' Reserved Area.\n\nFor the application submission, upload your passport only.\nThe ISEE Parificato requires a physical appointment at a CAF office in Italy. Submit it before 31 March 2027."),
      s("Documents to prepare", "1. Family Income Certificate on Affidavit (notarized)\n2. Property Certificate on Affidavit (notarized)\n3. FRC — 2026 latest, attested from MOFA\n\nPakistani students: an Affidavit with a Notary Public is accepted."),
      s("Income & property", "Income and property details must be based on the 2024 year only.\nMovable and immovable assets as per records of 31 December 2024.\n\nPrepare the income and property documents before booking the CAF appointment — the office issues the ISEE value from these papers."),
      s("ISEE Parificato — CGIL CAF offices in Campania", "Avellino — Via Luigi Amabile, 39, 83100 Avellino\nBenevento — Via L. Vanvitelli, 10, 82100 Benevento\nCaserta — Via Ferrarecce, 129, 81100 Caserta\nNapoli Centro — Corso Umberto I, 381, 80138 Napoli\nNapoli Vomero — Via Cilea, 119, 80127 Napoli\nNapoli Pianura — Via Provinciale Montagna Spaccata, 500, 80126 Napoli\nSalerno — Via Pietro del Pezzo, 47, 84125 Salerno\nTorre Annunziata — Corso Vittorio Emanuele III, 92, 80058 Torre Annunziata (NA)\nNocera Inferiore — Via Atzori, 37, 84014 Nocera Inferiore (SA)\n\nAppointments are required at every office."),
    ],
  },
  {
    match: "ADSU L'Aquila",
    academic_year: "2026/2027",
    application_deadline: "27 July 2026, 13:00",
    apply_url: "https://adsuaq-sol-apps.dirittoallostudio.it/",
    source_url: "https://www.adsuaq.org",
    sections: [
      s("What this guide covers", "Student housing (Studentato), not the scholarship itself. ADSU L'Aquila publishes the two separately — check the scholarship call as well if the student needs both."),
      s("Important date", "Application deadline: 27 July 2026, 13:00.\nOnline application only, through the ADSU L'Aquila Sportello Online."),
      s("Important note", "For students whose family lives abroad.\nForeign-family documents must show family composition, 2025 income, 31 December 2025 assets, and rent details if applicable.\n\nDocument preparation: first translate the original documents into Italian, THEN legalize or apostille the original and the translation together.\n\nIf the documents cannot be produced in time you may still apply, but you will be placed at the end of the foreign-student ranking. Non-compliant documentation is treated as not submitted in time."),
      s("Apply link / access", "Portal route: adsuaq.org → Sportello Online A.A. 2026/2027 → Richiesta Benefici e Servizi → Richiesta Studentato\nDirect portal: https://adsuaq-sol-apps.dirittoallostudio.it/\nSPID / CIE is required.\nOfficial website: www.adsuaq.org"),
      s("Universities / institutions", "University of L'Aquila\nConservatorio di Musica \"A. Casella\"\nAccademia di Belle Arti dell'Aquila"),
      s("How to apply", "1. Open the ADSU L'Aquila Sportello Online portal.\n2. Select tab 2026/2027.\n3. Open \"Richiesta Benefici e Servizi\".\n4. Choose \"Richiesta Studentato\".\n5. Complete the online application.\n6. Attach foreign documents in PDF if your family is abroad.\n7. Submit before 27 July 2026, 13:00.\n8. Keep a copy of everything you submit."),
      s("Required foreign documents", "Family composition certificate / FRC\nGross income of each family member for calendar year 2025\nImmovable property abroad as of 31 December 2025, with area in square meters\nMovable assets abroad as of 31 December 2025\nRent paid for the family residence, if applicable\n\nIf no property exists, the documents must state the absence of owned buildings. Documents must be issued by the competent authorities and translated into Italian."),
      s("Income / asset year details", "Income year to declare: 2025\nImmovable asset reference date: 31 December 2025\nMovable asset reference date: 31 December 2025\nFor property, specify surface area in square meters."),
      s("Residences available", "Il Moro — Pal. H1 e H8 — Via Antica Arischia 46\nCondominio Australia — Via Australia 6/A\nCampus Cannelle — Via Tancredi da Pentima 2\nKampus Grand Hotel — Corso Federico II 74\n\n75 beds available (more may become available). 15% of places are reserved for foreign students. 8 accessible places for students with disability 66% or higher."),
      s("Ranking / foreign student note", "Separate rankings are prepared for Italian and foreign students.\nFor each type of bed, ranking is ordered by increasing ISEE; ties are broken by order of application arrival.\nIf documents are missing by the deadline, the application is still valid but placed at the bottom of the foreign-student ranking."),
      s("Useful links / contact", "Official call: adsuaq.org/2026/06/24/bando-studentato-a-a-2026-2027/\nApplication portal: adsuaq-sol-apps.dirittoallostudio.it/\nADSU L'Aquila — Via dell'Arcivescovado, 8 — 67100 L'Aquila\nWebsite: www.adsuaq.org\nPEC: adsuaq@pec.regione.abruzzo.it"),
    ],
  },
  {
    match: "ARDiS FVG",
    academic_year: "2026/2027",
    application_deadline: "31 August 2026",
    apply_url: "https://www.ardis.fvg.it",
    source_url: "https://www.ardis.fvg.it",
    sections: [
      s("Important date", "Application deadline: 31 August 2026.\nSingle Call for University Students — A.Y. 2026/2027. No extension."),
      s("Important note", "Submit your online application on the ARDiS portal.\nAfter submission, upload ONLY the documents requested by ARDiS (if any).\nISEE Parificato is mandatory."),
      s("Apply link / access", "Portal: https://www.ardis.fvg.it\nRegister / login and fill the online application for A.Y. 2026/2027.\nComplete all sections and upload documents only if requested."),
      s("Universities covered", "University of Trieste\nUniversity of Udine"),
      s("How to apply", "1. Go to the ARDiS portal and register / login.\n2. Fill in the online application for A.Y. 2026/2027.\n3. Upload all required documents (only if requested by ARDiS).\n4. ISEE Parificato is mandatory — get it made from a CAF office.\n5. Submit the application before 31 August 2026.\n6. Track your application status on the portal.\n7. Follow all instructions and deadlines in the official call."),
      s("Required documents", "1. Income Certificate (foreign family) — based on 2024 income.\n2. Property Certificate (foreign family) — foreign assets declaration only; Italy assets not required.\n3. Family Registration Certificate (FRC) — issued in your country and translated.\n\nPrepare these based on your family situation and use them for the ISEE Parificato."),
      s("Income certificate (foreign family — year 2024)", "Must include all family members' income for the year 2024.\nInclude salary, business, rent, agriculture, pension, scholarships and any other source.\nMention family members' names and relationship.\nNo need to include assets in this document.\nIssued by a competent authority (e.g. Tehsildar / Union Council / Tax Authority)."),
      s("Property certificate note (foreign family)", "Provide a declaration of assets for the family abroad only — do not include assets in Italy.\nInclude land, house, plot, commercial property, vehicles, bank accounts, investments.\nFRC, property certificate and income certificate must be consistent in names and relations.\n\nImportant: apostilled / legalized and Italian-translated documents are for the CAF office — NOT for uploading to the portal, unless ARDiS specially requests them."),
      s("CAF offices (ISEE Parificato)", "The ISEE Parificato must be prepared by an authorized CAF office in Friuli Venezia Giulia.\nOfficial list: ardis.fvg.it/contenuti.php?view=news&id=11198&tipo=evidenza\n\nTake your apostilled and Italian-translated documents to the CAF for the ISEE Parificato."),
      s("Final upload & reminders", "Upload only the documents specifically requested by ARDiS in the portal.\nThe ISEE Parificato is transmitted by the CAF to ARDiS — you do not need to enter an ISEE protocol number.\nIncomplete applications will not be considered.\nIncome & asset details (2024): ardis.fvg.it/upload/schede/1782713728.pdf"),
    ],
  },
  {
    match: ["DSU Bergamo", "Università degli Studi di Bergamo"],
    academic_year: "2026/2027",
    application_deadline: "Check the UniBg portal for the window; ISEEU Parificato request by 15 December 2026",
    apply_url: "https://www.unibg.it/servizi/segreteria/borse-studio",
    source_url: "https://www.unibg.it",
    sections: [
      s("Important deadlines", "Scholarship & accommodation call: A.Y. 2026/2027.\nCheck the official UniBg scholarship portal for the application window.\nISEEU Parificato request deadline: 15 December 2026.\n\nAlways verify the final call before submission."),
      s("Eligible university", "University of Bergamo (Università degli Studi di Bergamo)"),
      s("Online application", "Submitted online through the University of Bergamo scholarship portal.\nStudent services: unibg.it/servizi/segreteria/borse-studio\nScholarship call: unibg.it/bandi/bando-borse-studio-e-residenze-universitarie-aa-20262027-scholarships-and-accommodation"),
      s("Required documents (2025 reference year)", "Family Income Certificate (2025) on Affidavit & notarized\nNo Property Certificate (2025) on Affidavit & notarized\nFamily Registration Certificate (FRC), MOFA attested\nPassport / ID\nIf applicable, death certificate of deceased parent\n\nIncome details for 2025 only. Property details (movable & immovable assets) until 31 December 2025. All documents must be issued in 2026."),
      s("Legalization & translation", "For Pakistani students, documents prepared on Affidavit & notarized are acceptable.\nNo apostille or further legalization is required.\nThe Italian translation is NOT required.\nAffidavit documents have full visa value for DSU Bergamo."),
      s("Document preparation (Pakistan)", "Income Affidavit (English)\nIncome Affidavit (Italian)\nNo Property Affidavit (English)\nNo Property Affidavit (Italian)\nFRC (MOFA attested)\n\nIncome: 2025 year only. Property (movable & immovable assets): until 31 Dec 2025."),
      s("ISEEU Parificato", "International students with income or assets abroad must request an ISEEU Parificato.\nCAF CISL Lombardia — Via Carnovali 88/A, Bergamo.\nOpen a ticket at servizi.cafcisllombardia.it/help/3086425405 and select \"Università di Bergamo\".\n\nFor this call the ISEEU is valid only if submitted by the deadline for the online application."),
      s("Independent student", "Residence separate from the family for at least 2 years.\nAnnual employment income of at least €9,000.\nOtherwise, parents' income and assets are required."),
      s("Important notes", "Prepare documents first.\nSend documents to CAF CISL for the ISEEU Parificato.\nThe ISEEU must be submitted before the official deadline.\nWithout an ISEEU Parificato, students are placed in the highest contribution bracket."),
    ],
  },
  {
    match: "Università degli Studi di Milano (Statale)",
    academic_year: "2026/2027",
    application_deadline: "30 September 2026",
    apply_url: "https://elixforms.unimi.it/",
    source_url: "https://www.unimi.it",
    isee_threshold: "≤€26,887.93",
    ispe_threshold: "≤€57,452.06",
    sections: [
      s("Covered university", "University of Milan (UNIMI).\nBachelor, Master and single-cycle students enrolled or enrolling at UNIMI."),
      s("Application period", "Applications open: 10 July 2026\nFinal deadline: 30 September 2026\n\nLate applications are not accepted. Submit online only."),
      s("Economic requirements", "Economic eligibility is assessed through the ISEE Università 2026.\nISEE Università 2026 must not exceed €26,887.93.\nISPE must not exceed €57,452.06."),
      s("Important information for Pakistani students", "Pakistani students are exempt from submitting financial assessment documents for the DSU Regional Scholarship, according to the University of Milan's official guidelines.\nOnly fill the form online."),
      s("Links & how to apply", "Scholarship page: https://www.unimi.it/en/study/financial-support/regional-scholarships\nApply online: https://elixforms.unimi.it/\nHow to apply (video): https://www.youtube.com/watch?v=sAD1PlucBVo&t=255s"),
    ],
  },
  {
    match: "Università degli Studi di Milano-Bicocca",
    academic_year: "2026/2027",
    application_deadline: "30 September 2026",
    apply_url: "https://unimib-ol.dirittoallostudio.it",
    source_url: "https://www.unimib.it",
    isee_threshold: "≤€26,887.93",
    ispe_threshold: "≤€58,452.06",
    sections: [
      s("Important dates", "Applications open: 7 July 2026\nHousing deadline: 20 August 2026\nScholarship deadline: 30 September 2026\nCanteen / extraordinary grant / mobility: 30 April 2027\n\nNo extensions for the online procedure."),
      s("Important note", "The application can be submitted even if you are not enrolled yet.\nISEE is not required to submit the first online application.\nCorrect ISEE / DSU handling must be completed by the official deadline.\nPakistan: no foreign economic documents upload for DSU Sportello Online."),
      s("Apply link / access", "Application portal: unimib-ol.dirittoallostudio.it\nAccess through UNIMIB Sportello Online.\nUse university credentials; if missing, register on Segreterie Online.\nAn Italian fiscal code may be needed for international students."),
      s("University covered", "Università degli Studi di Milano-Bicocca.\nBenefits: scholarship, housing, canteen service, extraordinary grant.\nEligible: Bachelor, Master, single-cycle Master, PhD and Specialisation students.\nOpen also to future students for A.Y. 2026/2027."),
      s("How to apply", "1. Open UNIMIB Sportello Online.\n2. Login or register.\n3. Select DSU benefits.\n4. Fill the scholarship form.\n5. Add housing, canteen, disability or mobility only if needed.\n6. Submit before the deadline.\n7. Save the submitted application PDF.\n8. Use YouTube only for guidance — Sportello is final."),
      s("Pakistan upload rule", "Country: Pakistan\nPDF reference: ISEE Guide p.13 + Table 1 row p.17\nUpload rule: no foreign economic documents to attach online for DSU."),
      s("ISEE / income details", "Required ISEE year: 2026\nReference income / assets year: 2024\nScholarship ISEE limit: €26,887.93\nScholarship ISPE limit: €58,452.06\nDSU ISEE deadline for scholarship: 30 September 2026\nHousing ISEE deadline: 20 August 2026"),
      s("Pakistan table values", "Pakistan is listed in Table 1 of the UNIMIB ISEE Guide.\nPIL PPA: €6,435.14; assigned ISEE: €3,870.76\nNo-documents rule: ISEE Guide PDF page 13\nPakistan row: Table 1, PDF page 17 / printed page 16\nForeign documents are needed only if an alternative ISEE calculation is requested."),
      s("Rankings / results", "Scholarship provisional ranking: by 31 October 2026\nAppeals: within 15 days after the provisional ranking\nScholarship final ranking: by 30 November 2026\nFirst scholarship installment: by 31 December 2026\nFree meal right begins: 1 January 2027\nHousing provisional ranking: by 2 September 2026; final by 18 September 2026"),
      s("Useful links / contact", "Apply: unimib-ol.dirittoallostudio.it\nOfficial page: unimib.it → Benefici Diritto allo Studio\nRead: DSU Benefits 2026/2027 ENG, GUIDA ISEE 2026/2027\nScholarship email: dsu@unimib.it\nISEE email: contribuzione@unimib.it"),
    ],
  },
  {
    match: "DiSCo Lazio",
    academic_year: "2026/2027",
    application_deadline: "22 July 2026, 12:00",
    apply_url: "https://laziodisco.it/",
    source_url: "https://laziodisco.it/",
    stipend_amount: "Up to €7,557 (fuori sede)",
    benefits: "Up to €7,557 for fuori sede students; free meals at university canteens",
    sections: [
      s("Important dates", "Application opens: 10 June 2026\nApplication deadline: 22 July 2026, 12:00\nCorrections & modifications: 30 July – 11 August 2026\nISEEUP deadline: 10 December 2026\nRental contract submission (students in Italy): 29 November 2026\nRental contract upload (DiSCo portal): 27 December 2026\nEnrollment & residence permit regularization: 10 February 2027"),
      s("Eligible universities", "Sapienza University of Rome\nUniversity of Rome Tor Vergata\nRoma Tre University\nUniversity of Cassino and Southern Lazio\nTuscia University\nUniversity of Rome Foro Italico"),
      s("Apply online", "Apply online: https://laziodisco.it/\nHow to apply — video: https://www.youtube.com/watch?v=sXVefxcHdRk"),
      s("Scholarship benefits", "Up to €7,557 for fuori sede students.\nFree meals at university canteens."),
      s("Required documents", "Family Income Certificate issued by FBR\nFamily Property Certificate (if applicable)\n\nIf the FBR Income Certificate clearly states that the sponsor / family owns no property, a separate property certificate may not be required.\nAll documents must be apostilled and translated into Italian.\nComplete the ISEE Universitario Parificato (ISEEUP) after arrival in Italy through an approved CAF office."),
    ],
  },
  {
    match: "DSU Toscana",
    academic_year: "2026/2027",
    application_deadline: "7 September 2026, 13:00",
    apply_url: "https://sportellostudente.dsu.toscana.it",
    source_url: "https://www.dsu.toscana.it",
    sections: [
      s("Important deadline", "Application period opens: 20 July 2026\nFinal deadline: 7 September 2026, 13:00\n\nFor specialisation / PhD, a separate window may apply."),
      s("Eligible universities", "University of Florence\nUniversity of Pisa\nUniversity of Siena"),
      s("Apply link / access", "Apply portal: https://sportellostudente.dsu.toscana.it\nApplications are submitted online through the DSU Toscana student portal."),
      s("Required documents", "Income Certificate for year 2025\nProperty / Asset Certificate for year 2025\nFRC / family composition certificate\nPassport / identity document\nIf a parent or guardian is deceased, attach the death certificate\n\nThese documents must be issued in 2026."),
      s("Legalization & translation", "For foreign documents, use original official documents issued by the competent authorities.\nEach required document must be apostilled or legalized, where applicable.\nThen translate the documents into Italian.\nThe Italian translation must also be legalized / certified as required.\n\nSelf-certifications, affidavits or informal declarations are NOT accepted."),
      s("Family / sponsorship note", "Do NOT prepare the scholarship file using siblings' sponsorship or self-sponsorship when the case belongs to the family of origin.\nYou must show the parents' / family-of-origin income and property documentation according to the scholarship conditions.\nIf only one parent is present, add the related supporting proof when applicable."),
      s("Income & property details", "Show family income for the 2025 year.\nShow immovable property owned by family members.\nShow movable assets / bank balances / financial assets where required.\nUse the parents' side family data unless the student truly qualifies as independent."),
      s("Independent student note", "Independent students must normally prove separate residence from the family of origin for at least 2 years.\nThey must normally prove minimum gross work income of €9,000 or above.\n\nA practical rule — always verify against the final call."),
      s("Offices by university", "Florence students — Viale Morgagni 51, Firenze\nPisa students — Piazza dei Cavalieri 6, Pisa\nSiena students — Via Mascagni 53, Siena\n\nSend / submit original documents to the office linked to your university."),
    ],
  },
  {
    match: "EDiSU Pavia",
    academic_year: "2026/2027",
    application_deadline: "15 September 2026, 15:00",
    apply_url: "https://edisupv-ol.dirittoallostudio.it/istud/",
    source_url: "https://www.edisu.pv.it/servizi/borsa-di-studio-ordinaria/",
    isee_threshold: "≤€26,887.93",
    ispe_threshold: "≤€58,452.06",
    sections: [
      s("Important dates", "Online application deadline: 15 September 2026, 15:00\nForeign documents upload deadline: 15 September 2026, 15:00\nOriginal foreign documents must also REACH EDiSU by 15 September 2026, 15:00.\n\nLate or incomplete original documents may lead to exclusion from the ranking."),
      s("Important note", "FIRST get the original documents translated into Italian.\nTHEN legalize or apostille both the original documents and the Italian translations together, where applicable.\nDo this before uploading and sending them."),
      s("Apply link / access", "Apply portal: https://edisupv-ol.dirittoallostudio.it/istud/\nOfficial scholarship page: www.edisu.pv.it/servizi/borsa-di-studio-ordinaria/"),
      s("University covered", "University of Pavia — students enrolled at, or to be enrolled at, the University of Pavia."),
      s("Step-by-step process", "1. Register / log in to the EDiSU Pavia online portal.\n2. Fill in and confirm the scholarship application.\n3. Prepare foreign-family income and asset documents for calendar year 2025.\n4. Upload all required foreign documents in PDF under \"Carica documenti\" → \"documentazione estera\".\n5. Submit the same foreign documents in ORIGINAL to EDiSU by 15 September 2026, 15:00.\n6. Deliver by appointment at Via Calatafimi 11, Pavia, or send by post.\n7. Keep proof of shipment / delivery."),
      s("Required documents", "Income Certificate (2025)\nNo Property Certificate (mandatory) with movable and immovable asset details as of 31 December 2025\nFamily Registration Certificate (FRC)\nPassport / identity document\nScholarship application submitted PDF\nAdmission letter\n\nAll foreign documents must be complete, official, clearly legible, legalized / apostilled where applicable, and translated into Italian."),
      s("Income certificate / family data (2025)", "For each adult family member, show gross income earned in calendar year 2025, or unemployment status.\nShow family composition, including the student and all cohabiting members, dates of birth and relationship.\nIf income is not separately shown, include the income column in the combined family / no property documentation.\nUse official documents issued by the competent authorities of the country where the income was produced."),
      s("No property certificate / asset details", "The No Property Certificate is mandatory.\nShow whether each adult family member owns buildings abroad as of 31 December 2025, with surface area in square meters, or clearly state absence of property.\nShow movable assets available abroad as of 31 December 2025, including the December 2025 bank balance and any financial investments.\nIf the family also has income or assets in Italy, those must be declared as well."),
      s("Original document submission", "The student is fully responsible for delivery of the original documents. If originals are not submitted completely and correctly, the student can be excluded from benefits. Send by courier well in advance.\n\nHand delivery: EDiSU counters (by appointment only), Via Calatafimi 11, 27100 Pavia\nPost / courier: EDiSU Pavia, Via Sant'Ennodio 26, 27100 Pavia, Italy"),
      s("Economic limits", "ISEE UNI 2026 limit: €26,887.93\nISPE UNI 2026 limit: €58,452.06\nBoth limits must be met together."),
    ],
  },
  {
    match: "ER.GO",
    academic_year: "2026/2027",
    application_deadline: "24 August 2026",
    apply_url: "https://www.er-go.it/dossier-utente/",
    source_url: "https://www.er-go.it",
    sections: [
      s("Important date", "Application deadline: 24 August 2026.\nApply online through the Dossier Utente portal before the deadline."),
      s("Important note", "First submit your online application for benefits 2026/27 on the Dossier Utente portal.\nAfter submitting the online application, prepare your supporting documents according to the call requirements."),
      s("Apply link / access", "Portal: www.er-go.it/dossier-utente/\nAccess the portal using your university online credentials.\nFerrara University students: you may need to request your portal credentials separately."),
      s("Universities covered", "University of Bologna\nUniversity of Ferrara\nUniversity of Modena and Reggio Emilia\nUniversity of Parma"),
      s("How to apply", "1. Open the Dossier Utente portal.\n2. Log in with your university credentials.\n3. Submit the online application for benefits 2026/27.\n4. Prepare all required documents based on the full year 2025 income and property details.\n5. Legalize / apostille the documents.\n6. Translate the documents into Italian.\n7. Scan and merge the complete apostilled + translated documents into ONE PDF.\n8. Upload that single PDF in the Dossier section for foreign income documentation."),
      s("Documents required", "Based on the complete year 2025 income with property details.\n\n1. Income certificate in the name of one parent or sibling. A sibling income declaration is accepted only if the parents are deceased.\n2. No Property Certificate with the added income column for all complete family members, issued by Tehsildar / Mukhtiarkar.\n3. New NADRA FRC template showing all family members and marital status."),
      s("Important family / marital status note", "When you request the family income table or income column, the marital status column must be filled carefully.\nIf any sibling is married, write: Married / Living Separately.\nThis line is very important. If it is missing, ER.GO may ask for that person's family income details separately."),
      s("Apostille / translation note", "Apostille / legalization means official authentication of your documents for use abroad.\nAfter legalization / apostille, translate all required documents into Italian.\nOnly after legalization and translation should you prepare the upload file."),
      s("Final PDF upload", "Upload only ONE complete PDF.\nThat PDF must contain the full legalized / apostilled documents and their Italian translations together.\nUpload it in the Dossier section for foreign income documentation before 24 August 2026."),
    ],
  },
  {
    match: "ERDIS Marche",
    academic_year: "2026/2027",
    application_deadline: "28 August 2026",
    apply_url: "https://erdis-marche.dirittoallostudio.it",
    source_url: "https://www.erdis.it",
    isee_threshold: "≤€24,000.00",
    ispe_threshold: "≤€50,000.00",
    sections: [
      s("Important dates", "Applications open: 14 July 2026\nOnline application deadline: 28 August 2026\nComplete original foreign documentation for definitive review: 18 September 2026\nIf documents sent by 18 September are incomplete or imperfect, supplementary documents may be accepted by 21 October 2026.\nProvisional rankings: indicative publication by around 15 September 2026."),
      s("Important note", "For income and assets abroad, self-certification is NOT accepted.\nFirst obtain the original documents from the competent authorities.\nThen legalize each document, or use Apostille where applicable.\nAfter that, get the documents translated into Italian by an official translator or with certified conformity to the foreign text.\nUpload the required files online and send the complete original documents before the deadline.\n\nTranslation tip: ask the translator to include \"Questo certificato è una rappresentazione vera e accurata del documento originale\"."),
      s("Apply link / access", "Personal area / application portal: erdis-marche.dirittoallostudio.it\nOfficial news page: erdis.it/notizie/3615023/pubblicato-bando-borsa-studio-erdis-marche-2026\nApply online only. Access usually through SPID / CIE / CNS.\nInternational students without an Italian ID can request ERDIS credentials for online access."),
      s("Universities covered", "University of Camerino\nMarche Polytechnic University\nUniversity of Macerata\nUniversity of Urbino Carlo Bo\n\nAlso includes associated institutes, academies and conservatories listed in the ERDIS call."),
      s("Step-by-step process", "1. Register / log in to the ERDIS personal area.\n2. Fill in and confirm the online scholarship application.\n3. Prepare family composition, 2024 income and 31/12/2024 asset documents.\n4. Legalize / apostille the foreign documents where required.\n5. Obtain certified Italian translations.\n6. Upload the required attachments online.\n7. Send the original complete documents to the correct ERDIS territorial center.\n8. Keep the courier receipt and monitor rankings / review requests."),
      s("Required documents", "Income certificate (tax year 2024)\nNo property / real estate certificate with full family asset details\nMovable asset details / bank balance / investments documentation\nFRC — new 2025 family registration certificate showing marital status\nPassport / identity document\nScholarship application submission / related online records"),
      s("Income certificate / family data", "Show the income of each adult family member for the year 2024 only.\nIf an adult has no income, this must be explicitly stated.\nShow the family composition and marital status clearly.\nUse documents issued by the competent authorities of the country where the income was produced."),
      s("No property certificate / asset details", "Show all immovable assets owned by each family member as of 31 December 2024.\nShow movable assets held abroad as of 31 December 2024, or the annual average where applicable.\nInclude bank balances, savings and financial investments where relevant.\nIf a family member has no property or movable assets, that absence should be clearly stated."),
      s("Territorial centers / original document submission", "Ancona — Via Oddo Di Biagio 14, 60121 Ancona (Marche Polytechnic University and associated institutes)\nCamerino — Via Le Mosse, Colle Paradiso 1, 62032 Camerino (MC); Ascoli linked site: Via della Rimembranza 3, 63100 Ascoli Piceno (AP)\nMacerata — Via Martiri della Libertà 15-17-19, 62100 Macerata (University of Macerata and associated institutes)\nUrbino — Via V. Veneto 45, 61029 Urbino (University of Urbino Carlo Bo and associated institutes)"),
      s("Economic limits", "ISEE limit: €24,000.00\nISPE limit: €50,000.00\n\nFor students with family income or assets abroad, ERDIS calculates the equivalent university indicator from the submitted documents."),
    ],
  },
  {
    match: "ERSU Catania",
    academic_year: "2026/2027",
    application_deadline: "10 August 2025, 14:00",
    apply_url: "https://studenti.ersucatania.it/",
    source_url: "https://www.ersucatania.it",
    sections: [
      s("Important dates", "Application period (online only) starts: 24 June 2025 at 19:00\nEnds: 10 August 2025 at 14:00\n\nNOTE — the source guide gives 2025 dates under an A.Y. 2026/2027 heading. Verify against the official ERSU Catania call before advising a student."),
      s("Important note", "Apply online with your passport only.\nAfter the online application, prepare the ISEE Parificato at a Catania CAF office using the family income certificate (affidavit) with the complete unit table of income and assets for the 2024 income year only.\nUpload your ISEE Parificato before the October deadline for full benefits."),
      s("Apply link", "Apply online: https://studenti.ersucatania.it/\nUse your passport and follow the online application steps carefully."),
      s("ISEE Parificato", "Prepare the ISEE Parificato from the Catania CAF region offices.\nUse the affidavit (family income certificate) with the complete unit table of income and assets for the 2024 income year only.\nRequired for evaluation and full benefits."),
      s("CAF registered offices (Catania region)", "Catania — Via Antonino di Sangiuliano n. 365\nCatania — Via Duca degli Abruzzi n. 75/C\nCatania — P.zza O. Respighi n. 4\nTremestieri Etneo (CT) — Via Nizzeti n. 68\nFrancofonte (SR) — Via Giuseppe La Farina n. 4"),
      s("Documents required", "Affidavit (family income certificate) with complete unit table (2024)\nCNIC / passport (applicant and all family members)\nFRC / Family Registration Certificate (updated)\nAny other document required by ERSU Catania"),
      s("Step-by-step process", "1. Apply online on the ERSU Catania portal with your passport.\n2. After successful submission, note your protocol number.\n3. Prepare the affidavit with the complete unit table of income and assets for 2024.\n4. Visit any CAF office listed above and make the ISEE Parificato.\n5. Upload the ISEE Parificato on the portal before the October deadline.\n6. Keep checking your portal for updates and communications."),
      s("Income certificate (affidavit) — template", "Annual income 2024 and movable & immovable assets as per records of 31 December 2024 only.\n\nColumns: Sr. No. | Name | Relation with applicant | Date of birth (DD-MM-YYYY) | Marital status | Profession / occupation | Annual income 2024 (PKR) | Movable assets (31-12-2024) | Immovable assets (31-12-2024)\n\nFooter: \"I hereby declare that the above information is true and correct to the best of my knowledge and belief.\" Applicant name, CNIC / Passport No., Date."),
    ],
  },
  {
    match: "ERSU Messina",
    academic_year: "2026/2027",
    application_deadline: "18 August 2026, 14:00",
    apply_url: "https://studenti.ersumessina.it/",
    source_url: "https://www.ersumessina.it",
    isee_threshold: "≤€22,500.00",
    ispe_threshold: "≤€53,000.00",
    sections: [
      s("Important dates", "Application period (online only): 1 July 2026 — 18 August 2026, 14:00\nOTP validation deadline for international students / minors: 18 August 2026, 15:00\nRegularization deadline for international students (ISEE Parificato + docs): 16 September 2026\nLate regularization deadline: 30 November 2026\n\nApplications regularized by 30 November 2026 will be placed at the bottom of the ranking."),
      s("Important note", "International students must upload the ISEE Parificato in the \"Fascicolo\" section.\nThe ISEEU / ISPEU Parificato must be calculated by a convenzionato CAF.\nSupporting documents from the country of origin must be translated into Italian and legalized, if applicable.\nDeclare family income and assets abroad, and any family income or assets in Italy."),
      s("Apply link", "Apply online: https://studenti.ersumessina.it/\nStudents with Italian ID / residents in Italy: access with SPID or CIE.\nInternational students not resident in Italy: register and access with credentials issued by the Ente.\nOfficial website: www.ersumessina.it"),
      s("ISEE Parificato", "Mandatory for international students.\nBased on the country where the family income is produced and where the family assets are held.\nEconomic reference year: 2024 income and 2024 asset situation.\nUpload in the Fascicolo by 16 September 2026; if uploaded by 30 November 2026, ranking moves to the bottom."),
      s("CAF registered offices (ERSU Messina list)", "CAF CGIL — www.cafcgil.it\nCAF CISL — www.caafcisl.it\nCAF UIL — www.cafuil.it\nCAF ACLI — www.acli.it\nCAF CNA — www.cafcna.it\nEUROCAF — www.eurocaf.it\nCAF ITALIA — www.cafitalia.org\nCAF UNSIC — www.unsic.it\n\nUse any convenzionato CAF from the official ERSU Messina list; branches may be available nationwide."),
      s("Documents required", "ISEE Parificato\nPassport / identity document\nResidence permit or renewal receipt (if applicable)\nAffidavit / Family Income Certificate for 2024\nFamily asset details for 2024\nFRC / Family Registration Certificate (attested by MOFA)\nItalian translation / legalization if required"),
      s("Step-by-step process", "1. Register / log in on the ERSU Messina student portal.\n2. Submit the online application by 18 August 2026.\n3. Prepare foreign-family income and asset documents for year 2024.\n4. Go to a convenzionato CAF and obtain the ISEE Parificato.\n5. Upload the ISEE Parificato and all supporting documents in the Fascicolo by 16 September 2026.\n6. If delayed, final regularization is possible by 30 November 2026, but you will be placed at the bottom of the ranking.\n7. Monitor the ERSU portal for results, rectifications and updates."),
      s("Important guidelines", "ISEE limit: €22,500.00\nISPE limit: €53,000.00\nUniversities covered: University of Messina; Conservatory of Music \"A. Corelli\" of Messina.\nDocuments from the country of origin must be translated into Italian and legalized if applicable.\nInternational students must also declare any family income or assets in Italy.\nIncomplete or incorrect documentation may lead to exclusion or lower ranking."),
      s("Income certificate (affidavit) — template", "Annual income 2024 and movable & immovable assets as per records of 31 December 2024 only.\n\nColumns: Sr. No. | Name | Relation with applicant | Date of birth (DD-MM-YYYY) | Marital status | Profession / occupation | Annual income 2024 | Movable assets (31-12-2024) | Immovable assets (31-12-2024)"),
    ],
  },
  {
    match: "ESU Padova",
    academic_year: "2026/2027",
    application_deadline: "30 September 2026 (regional scholarship, via Uniweb)",
    apply_url: "https://www.esu.pd.it/news/category/borse-e-bandi/bando-alloggi/",
    source_url: "https://www.esu.pd.it",
    sections: [
      s("Regional scholarship application", "Deadline: 30 September 2026.\nApply online through Uniweb (\"Application for benefits\" — Richiesta di agevolazioni)."),
      s("ESU accommodation application period", "Returning / following-year students: 3 July 2026 (10:00) to 19 August 2026 (10:00)\nFirst-year students: 3 July 2026 (10:00) to 25 August 2026 (10:00)"),
      s("Who can apply?", "International and non-EU students enrolled or enrolling at the University of Padova.\nStudents must satisfy ESU economic requirements (ISEE / ISEE Parificato).\nMerit requirements apply to continuing students."),
      s("Documents required for ISEE Parificato", "FBR Income Certificate for the 2024 year\nNo Property Certificate for the 2024 year\nFamily Composition Certificate (FRC) — latest date of 2026\nDeath Certificate (if applicable) — apostille required\n\nAll documents for the ISEE Parificato must be apostilled."),
      s("Important for international students", "After obtaining your ISEE Parificato for the University of Padova Regional Scholarship, you MUST upload the ISEE Parificato separately on the ESU Student Portal for accommodation benefits.\n\nScholarship and accommodation are two separate procedures."),
      s("ISEE Parificato process (regional scholarship)", "1. Request your ISEE Parificato by registering and uploading all required documents on the official CAF portal: http://parificati.confeuropadova.it (the only official portal for the University of Padova ISEE Parificato).\n2. CAF reviews and processes your documents.\n3. The ISEE Parificato is issued by the CAF.\n4. Apply for the Regional Scholarship through Uniweb before 30 September 2026.\n5. Use your ISEE Parificato information in the scholarship application."),
      s("ESU accommodation application process", "1. Submit the ESU accommodation application through the ESU Student Portal.\n2. Complete the online application before the deadline.\n3. Upload any required documents.\n4. Wait for the ESU accommodation ranking.\n5. If selected, accept the accommodation offer and pay the €380 deposit within the deadline."),
      s("Important deadlines (ESU)", "The ISEE Parificato must be processed before the ESU deadline.\nESU acquires ISEE Parificato data by 10 September 2026.\nStudents must regularly monitor the ESU Student Portal for updates and communications."),
      s("Important notes", "Accommodation is assigned through a competition and depends on ranking and room availability.\nBeing eligible does NOT guarantee accommodation.\nFirst-year international students are ranked according to ISEE Parificato.\nThe scholarship application and the ESU accommodation application are separate."),
      s("Required after selection", "Accept the accommodation offer through the ESU Student Portal.\nPay the €380 security deposit within the given deadline.\nComplete check-in according to ESU instructions."),
      s("Official links", "ESU accommodation call: https://www.esu.pd.it/news/category/borse-e-bandi/bando-alloggi/\nUniversity ISEE portal: http://parificati.confeuropadova.it\nUniversity of Padova ISEE info: https://www.unipd.it/en/isee"),
    ],
  },
];

const { data: bodies, error } = await db.from("scholarship_bodies").select("id, name, guide_sections");
if (error) {
  console.error(error);
  process.exit(1);
}

let matched = 0;
const unmatched = [];
for (const g of GUIDES) {
  const names = (Array.isArray(g.match) ? g.match : [g.match]).map((n) => n.toLowerCase());
  const body = bodies.find((b) => names.includes(b.name.toLowerCase()));
  if (!body) {
    unmatched.push(names.join(" / "));
    continue;
  }
  matched++;
  const already = Array.isArray(body.guide_sections) ? body.guide_sections.length : 0;
  console.log(`${APPLY ? "writing" : "would write"}  ${body.name.padEnd(42)} ${g.sections.length} sections${already ? ` (replacing ${already})` : ""}`);

  if (!APPLY) continue;
  const patch = {
    guide_sections: g.sections,
    academic_year: g.academic_year,
    application_deadline: g.application_deadline,
    apply_url: g.apply_url,
    source_url: g.source_url,
    call_status: "published",
    guide_updated_at: new Date().toISOString(),
  };
  if (g.isee_threshold) patch.isee_threshold = g.isee_threshold;
  if (g.ispe_threshold) patch.ispe_threshold = g.ispe_threshold;
  if (g.stipend_amount) patch.stipend_amount = g.stipend_amount;
  if (g.benefits) patch.benefits = g.benefits;

  const { error: upErr } = await db.from("scholarship_bodies").update(patch).eq("id", body.id);
  if (upErr) {
    console.error("  FAILED:", upErr.message);
    process.exit(1);
  }
}

console.log(`\n${matched} of ${GUIDES.length} guides matched a body.`);
if (unmatched.length) console.log("no body named:", unmatched);
const withoutGuide = bodies.filter(
    (b) => !GUIDES.some((g) => (Array.isArray(g.match) ? g.match : [g.match]).some((n) => n.toLowerCase() === b.name.toLowerCase()))
  );
console.log(`\n${withoutGuide.length} bodies have no guide PDF yet:`, withoutGuide.map((b) => b.name));
if (!APPLY) console.log("\nDry run. Re-run with --apply to write.");
