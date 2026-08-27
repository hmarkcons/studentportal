// Legal body text for each destination's retainer agreement, transcribed
// verbatim from the source documents provided in
// reference/Agreements/HMARK Student Contract - {Italy,Germany (Public)}.docx.
// Keyed by `${country_code}_${track}` since e.g. Germany (Public) and a
// future Germany (Private) are different destinations with different terms.
//
// Do not paraphrase or "fix" wording here — this is the actual contract text
// (including the source documents' own inconsistencies, e.g. Italy's clause 1
// phone number differing from Germany's) and must stay byte-accurate to what
// was provided. Extend this map when more destinations' agreements are added.

export type AgreementBlock =
  | { kind: "clause"; number: string; heading: string; intro?: string }
  | { kind: "bullet"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "feeTable" };

export type AgreementContent = {
  officeLine: string;
  blocks: AgreementBlock[];
};

export const AGREEMENT_CONTENT: Record<string, AgreementContent> = {
  DE_public: {
    officeLine:
      "HMARK Consultants - Office Address: Suite 101, Dashtiyar Chambers, Opp. Urdu Federal University, Gulshan-e-Iqbal, Block 13-C, University Road, Karachi, Pakistan. Landline #: 021 34 999 777",
    blocks: [
      { kind: "clause", number: "2.", heading: "Category: Student Visa" },
      {
        kind: "clause",
        number: "3.",
        heading: "HMARK Consultants Responsibilities and Commitment",
        intro: "The Client(s) asked the HMARK Consultants, and the HMARK Consultants has agreed, to act for the client(s) in the matter of",
      },
      {
        kind: "bullet",
        text: "The Consultant and her assignees shall perform her tasks while keeping with the rules of professional conduct in accordance with the embassy and university unless the undertaking in whole or in part constitutes services other than those listed within this agreement. In such cases, any work or undertaking would be agreed upon separately in a separate agreement depending on the matter and the nature of the services required. If in any way the client feel the consultant or the assignees which the consultant is responsible for act in an unethical or unprofessional manner, and after speaking to my consultants we cannot reach an agreement, the client have been informed and are aware that they proceed to make a formal complaint directly to the HMARK Consultant. Should the Regulator Council believe that a member or any assignee which the member is responsible for has violated the rules of professional conduct; the complaint shall be referred to a hearing of adjudication. If the client has any question or require any further information, the client may contact the Regulator Council at the above address or phone number(s).",
      },
      {
        kind: "bullet",
        text: "This agreement shall be construed as governed by Pakistan and that of the State and Country of the client Nationality and place of habitual residence. Each of the parties hereto irrevocably attorns to the jurisdiction of the relevant court authorities.",
      },
      {
        kind: "bullet",
        text: "The client hereby confirms understanding and agrees to the above terms and conditions of this agreement including parameters of fees, services, procedures and the mutual responsibilities.",
      },
      {
        kind: "bullet",
        text: "HMARK Consultants do not offer or guarantee any student job during or after the completion of the studies. The client is solely responsible for it.",
      },
      {
        kind: "bullet",
        text: "HMARK Consultants is not responsible for any scholarship/benefits (regional/merit), however, the complete application guidelines will be provided by HMARK Consultants to the client.",
      },
      {
        kind: "bullet",
        text: "HMARK Consultants only provide guidance on how to get an accommodation and not responsible for it. However, the initial arrangement of hotel booking can be provided.",
      },
      {
        kind: "bullet",
        text: "HMARK Consultants only provide assistance to student on Visa documentation and doesn't guarantee any visa issuance.",
      },
      {
        kind: "clause",
        number: "4.",
        heading: "Client(s) Responsibilities and Commitment",
        intro:
          "The Client(s) must provide, upon request from the HMARK Consultants, All documentation in English or translated in to English.\nThe member's obligations under the Retainer Agreement are null and void if the Client(s) knowingly provide(s) any inaccurate, misleading or false material information. I, as client hereby affirm that I have not and will not present and fraudulent, false or misleading information or documentation to either the consultants or company. I understand and agree that it is my responsibility to ensure that all required information and documentation required by either the consultant or the company is provided in a timely manner.",
      },
      { kind: "subheading", text: "Note:" },
      {
        kind: "bullet",
        text: "Students are required to provide IELTS overall band 6.5 for postgraduate and Undergraduate students and not less than 6 in each component as it is the mandatory requirement of the German universities and Embassy/Consulate.",
      },
      {
        kind: "bullet",
        text: "Students are required to meet the deadlines of German Embassy/Consulate. The scholarship can be revoked if student do not reach the university by the deadline of enrollment. However the scholarship can be awarded to the student in the next semester which student has to do it by self in the university.",
      },
      {
        kind: "bullet",
        text: "The client is required to provide the information of any kind of visa previously issued or refused.",
      },
      {
        kind: "bullet",
        text: "Please note that if you do not meet the required test scores set by your preferred university or program, your choice of university or program may not be considered. In such cases, you agree to accept an offer letter from any alternative university or program available based on your academic profile and eligibility.",
      },
      {
        kind: "bullet",
        text: "It is the sole responsibility of the client to check all the information about the university and program from the official university's website.",
      },
      {
        kind: "clause",
        number: "5.",
        heading: "Authorization",
        intro:
          "I certify that the information in this form is 100% accurate. I authorize all entities to provide relevant information to HMARK Consultants for use in considering my application and waive any required notice to me. I understand and agree that my misrepresentation or omission of facts in this application will justify the denial or cancelation of admission or visa. The Client's financial obligation remains.",
      },
      {
        kind: "clause",
        number: "6.",
        heading: "Billing Method and Payment Schedule",
        intro:
          "The Client(s) will not be billed by hour, only a flat fee will charge which is given below, if and only if the client will meet by an appointment. The details of this billing method are as follows:",
      },
      { kind: "feeTable" },
      {
        kind: "clause",
        number: "7.",
        heading: "Terms of Payment",
        intro:
          "Once the documents checklist is given, either through email or through a hard copy and the client acknowledges it by receiving respective document, then the consultancy fee involved stands non-refundable in case of any circumstances. The client agrees that the fee listed for the above services are paid fee covering only the services for the services outlined in this retainer agreement. I understand that this paid fee will be placed in company account and is payable upon the completion of each said services. These billings include all anticipated disbursement.",
      },
      {
        kind: "clause",
        number: "8.",
        heading: "Refund Policy",
        intro: "The Client(s) acknowledge that the granting of a visa or status and the time required for processing this application is at the sole discretion of the government and not the HMARK Consultants.",
      },
      {
        kind: "bullet",
        text: "The client(s) agrees that the above professional fees are non-refundable once work has commenced on behalf of the client. Should the termination of the services either on the consultants or the company's part take place, all monies earned by the consultant or the company as well as any disbursement paid or owed on my behalf by the company will be deducted from the professional fees. The client agrees that should the fees paid to date not cover any expense owed; said fees will be due and payable upon termination of the services.",
      },
      { kind: "bullet", text: "There shall be no refund payable to the client where the client unilaterally terminates or abandons this agreement." },
      {
        kind: "bullet",
        text: "In the event that the CLIENT chooses to terminate this agreement prior to either of the event made registration with HMARK Consultants or submitted for student visa to Germany, the full amount of the agreement client has to pay.",
      },
      {
        kind: "bullet",
        text: "The client understand that a refusal from university or embassy based on the medical condition, criminality, fraudulent documents, false or misleading information or the ability to meet the admissibility requirements will not be the responsibility of the consultant or the company and there will be no refund made in this condition.",
      },
      {
        kind: "bullet",
        text: "In case of student visa or admission refused or application returned due to capped in the particular profession regardless application launching date and receiving date at any university any amount paid to HMARK Consultants neither refund or adjusted.",
      },
      {
        kind: "bullet",
        text: "In case of visa rejection from the embassy, there will be no refund made to the client. The paid consultation fee is limited to the admission in public university of Germany only.",
      },
      {
        kind: "paragraph",
        text: "If however the application is denied because of an error or omission on the part of HMARK Consultants or professional staff, the HMARK Consultants will refund all professional fee collected and the administrative charges will be non-refundable. The Client(s) agrees that the fees paid are for services indicated above, and any refund is strictly limited to the amount of fees paid.",
      },
      {
        kind: "paragraph",
        text: "In case of no admission from any public university, HMARK will refund the first installment to the client via bank transfer or cheque in 90 working days.",
      },
      { kind: "subheading", text: "Dispute Resolution" },
      {
        kind: "paragraph",
        text: "Please be noted that HMARK Consultants is an official representative of the private universities it represents. HMARK Consultants is not an official representative of any public university of Germany and only process the admission application on behalf the client's consent.",
      },
      {
        kind: "paragraph",
        text: "In the event of dispute, the Client(s) and HMARK Consultants are to make every effort to resolve the matter between the two parties. In the event a resolution cannot be reached, the Client(s) are to make a complain in writing to HMARK Consultants and allow the HMARK Consultants 30 to 60 days to respond to the Client(s). In the event the dispute is still unresolved, the Client(s) may follow the complaint and discipline procedure outlined by the university you applied for.",
      },
      {
        kind: "clause",
        number: "9.",
        heading: "Confidentiality",
        intro:
          "All information and documentation reviewed by the university, required by embassy or any governing bodies, and used for the preparation of the application will not be divulged to any third party, other than agent and employees, without prior consent, except and demanded by the law. The Client(s) agrees to keep all the process and information confidential from any third parties.",
      },
      {
        kind: "clause",
        number: "10.",
        heading: "Force Majeure",
        intro:
          "The HMARK Consultant's failure to perform any term of this Retainers Agreement a result of conditions beyond his/her control such as, but not limited to, governmental restrictions or subsequent legalization, war, strikes, or acts of God, shall not be deemed a breach of this agreement.",
      },
      {
        kind: "clause",
        number: "11.",
        heading: "Change Policy",
        intro:
          "The Client(s) acknowledge that if the university or embassy ask to act on the Client(s) behalf on matter other than those outlined above in the Agreement, or because of a material change in the Client(s) circumstances, or because of material facts not disclosed at the outset of the application, or because change in the government legislation regarding the process of student visa related application, the Agreement can be modified accordingly upon mutual agreement.",
      },
      {
        kind: "clause",
        number: "12.",
        heading: "Others",
        intro:
          "The Client(s) understand(s) that they must be accurate and honest in the information they provide(s) and that any inaccuracies may void this Agreement, or seriously affect the outcome of the application or the retention of any status they may obtain.",
      },
      {
        kind: "clause",
        number: "13.",
        heading: "Government Fees and University Fees",
        intro:
          "The client understand that they are responsible to pay all government, embassy and university fee. The refund policy of any fee will be as per the government, embassy/consulate or university's policy. HMARK Consultants is not responsible for any kind of refund.\nThe client understands that they are responsible to bear criminal records check, medical, photos and any other necessary documentation required to complete the process. In case of any changes and delays occur due to pandemic, HMARK Consultants will not be held responsible.",
      },
      {
        kind: "clause",
        number: "14.",
        heading: "Conditions and Obligation",
        intro:
          "The client understands that the consultant or the company will be not liable or responsible for any payment made without the signing of this agreement as well as issuance of any official receipt. Should the client withdraw their application at stage, the client understands there are no refunds for the services rendered and client has to pay full amount as decided in total if cancellation of agreement occurred. The client understand that a refusal based on the medical condition, criminality, fraudulent documents, false or misleading information or the ability to meet the admissibility requirements will not be the responsibility of the consultant or the company.",
      },
      {
        kind: "clause",
        number: "15.",
        heading: "NOTE: AT THE TIME OF STUDENT VISA APPLICATION",
        intro:
          "Proof of sufficient funds to cover your tuition and living expenses for at least your whole course in Germany. Please submit: copies of your bank statement of last six months (Must). Any additional supporting documents demonstrating a reliable source of funds (notarized letter of undertaking and financial documents from personal or immediate family, official letter of scholarship or financial award, investment, income from rental properties, etc.) [NO BANK FINANCE ARE ALLOWED FOR GERMANY VISA. YOU MUST SHOW YOUR OWN PERSONAL MONEY. THERE IS NO GUARANTEE OF VISA; WE ARE JUST RESPONSIBLE TO PROCESS YOUR APPLICATION.]",
      },
      {
        kind: "clause",
        number: "16.",
        heading: "Authority To Release Personal Information To Designated Universities",
        intro:
          "I, as client authorized HMARK Consultants to serve as my representative and to conduct business and do all type of correspondence on my behalf with the public universities of Germany. I also authorized to release information from my case file and any dependent children under 18 years of age (if applicable). Also I have fully read and understood the agreement and comply with all the clauses in this agreement.",
      },
      {
        kind: "clause",
        number: "17.",
        heading: "Courier Charges",
        intro: "Client has to bear all DHL charges once DHL launch to GERMANY. We will provide DHL tracking number every time.",
      },
    ],
  },

  IT_public: {
    officeLine:
      "HMARK Consultants Office Address: Suite 101, Dashtiyar Chambers, Opp. Urdu Federal University, Gulshan-e-Iqbal, Block 13-C, University Road, Karachi, Pakistan. Landline #: 021 34 999 778",
    blocks: [
      { kind: "clause", number: "2.", heading: "Category: Student Visa" },
      {
        kind: "clause",
        number: "3.",
        heading: "HMARK Consultants Responsibilities and Commitment",
        intro: "The Client(s) asked the HMARK Consultants, and the HMARK Consultants has agreed, to act for the client(s) in the matter of",
      },
      {
        kind: "bullet",
        text: "The Consultant and her assignees shall perform her tasks while keeping with the rules of professional conduct in accordance with the embassy and university unless the undertaking in whole or in part constitutes services other than those listed within this agreement. In such cases, any work or undertaking would be agreed upon separately in a separate agreement depending on the matter and the nature of the services required. If in any way the client feels the consultant or the assignees which the consultant is responsible for act in an unethical or unprofessional manner, and after speaking to my consultants we cannot reach an agreement, the client have been informed and are aware that they proceed to make a formal complaint directly to the HMARK Consultant. Should the Regulator Council believe that a member or any assignee which the member is responsible for has violated the rules of professional conduct; the complaint shall be referred to a hearing of adjudication. If the client has any question or requires any further information, the client may contact the Regulator Council at the above address or phone number(s).",
      },
      {
        kind: "bullet",
        text: "This agreement shall be construed as governed by Pakistan and that of the State and Country of the client Nationality and place of habitual residence. Each of the parties hereto irrevocably attorneys to the jurisdiction of the relevant court authorities.",
      },
      { kind: "bullet", text: "HMARK Consultants will assist the client for September 2027 intake only." },
      {
        kind: "bullet",
        text: "The client hereby confirms understanding and agrees to the above terms and conditions of this agreement including parameters of fees, services, procedures and the mutual responsibilities.",
      },
      {
        kind: "bullet",
        text: "HMARK Consultants do not offer or guarantee any student job during or after the completion of the studies. The client is solely responsible for it.",
      },
      {
        kind: "bullet",
        text: "HMARK Consultants will at least submit applications in five (5) Italian universities. The name of the university issuing the admission will only be disclosed once the second installment has been paid by the client.",
      },
      {
        kind: "bullet",
        text: "HMARK Consultants is not responsible for any scholarship/benefits (regional/merit), however, the complete application guidelines will be provided by HMARK Consultants to the client.",
      },
      {
        kind: "bullet",
        text: 'HMARK Consultants is responsible to assist students for a tuition fee waiver (depending on ISEEU Value) for students "only" if the student provides ISEEU which can be issued to student upon arrival in Italy. Complete guidance will be provided to students on ISEEU issuance.',
      },
      {
        kind: "bullet",
        text: "HMARK Consultants only provide guidance on how to get an accommodation and are not responsible for it. However, the initial arrangement of hotel booking can be provided.",
      },
      {
        kind: "bullet",
        text: "HMARK Consultants only provides assistance to students on Visa documentation and doesn't guarantee any visa issuance.",
      },
      {
        kind: "clause",
        number: "4.",
        heading: "Client(s) Responsibilities and Commitment",
        intro:
          "The Client(s) must provide, upon request from the HMARK Consultants, All documentation in English or translated into English.\nThe member's obligations under the Retainer Agreement are null and void if the Client(s) knowingly provide(s) any inaccurate, misleading or false material information. I, as client hereby affirm that I have not and will not present fraudulent, false or misleading information or documentation to either the consultants or company. I understand and agree that it is my responsibility to ensure that all required information and documentation required by either the consultant or the company is provided in a timely manner.",
      },
      { kind: "subheading", text: "Note:" },
      {
        kind: "bullet",
        text: "Students are required to provide IELTS overall band 5.5 or B2 for postgraduate and undergraduate students and not less than 5 in each component as it is the mandatory requirement of the Italian University or Italian Consulate / Embassy. Or as per the requirement of Italian Universities and the Italian Consulate / Embassy.",
      },
      {
        kind: "bullet",
        text: "Students are required to meet the deadlines of the Italian Embassy/Consulate. The scholarship can be revoked if students do not reach the university by the deadline of the relevant region of scholarship. However, the scholarship can be awarded to the student in the next intake which student has to do by himself in the university.",
      },
      {
        kind: "bullet",
        text: "Once the agreement is signed, the candidate is not allowed to apply to any Italian university by himself. If the student has already applied to any Italian university before signing the agreement, the candidate needs to provide the credentials. In the case of getting acceptance at that particular university where the candidate has already applied before signing the agreement, the admission will also be considered even if there is no success from any other university in Italy and will be processed for pre-enrollment.",
      },
      {
        kind: "bullet",
        text: "All Undergraduate students need to pass the university's designated test (CEnT-S or SAT) in order to get admitted to the university. In case of failure, the offered admission in other than the prioritized fields of education will be accepted by the client.",
      },
      {
        kind: "bullet",
        text: "It is the sole responsibility of the undergraduate student to prepare for the exam required by the university and achieve the required score as per the admission requirement.",
      },
      {
        kind: "bullet",
        text: "All medical students (MBBS/MD, Dentistry) need to pass an IMAT test. In case of failure, HMARK Consultant will not be held responsible and liable to refund any amount.",
      },
      {
        kind: "bullet",
        text: "All postgraduate students need to pass a test or interview conducted by the university in order to get accepted for the applied program.",
      },
      {
        kind: "bullet",
        text: "Please note that if you do not meet the required test scores set by your preferred university or program, your choice of university or program may not be considered. In such cases, you agree to accept an offer letter from any alternative university or program available based on your academic profile and eligibility.",
      },
      {
        kind: "bullet",
        text: "It is the sole responsibility of the client to check all the information about the university and program from the official university's website.",
      },
      {
        kind: "bullet",
        text: "The client is required to provide the information of any kind of visa previously issued or refused.",
      },
      {
        kind: "clause",
        number: "5.",
        heading: "Authorization",
        intro:
          "I certify that the information in this form is 100% accurate. I authorize all entities to provide relevant information to HMARK Consultants for use in considering my application and waive any required notice to me. I understand and agree that my misrepresentation or omission of facts in this application will justify the denial or cancelation of admission or visa. The Client's financial obligation remains.",
      },
      {
        kind: "clause",
        number: "6.",
        heading: "Billing Method and Payment Schedule",
        intro:
          "The Client(s) will not be billed by hour, only a flat fee will be charged which is given below, if and only if the client will meet by an appointment. The details of this billing method are as follows:",
      },
      { kind: "feeTable" },
      {
        kind: "clause",
        number: "7.",
        heading: "Terms of Payment",
        intro:
          "Once the documents checklist is given, either through email or through a hard copy and the client acknowledges it by receiving the respective document, then the consultancy fee involved stands non-refundable in case of any circumstances. The client agrees that the fee listed for the above services is a paid fee covering only the services outlined in this retainer agreement. I understand that this paid fee will be placed in the company account and is payable upon the completion of each said service. These billings include all anticipated disbursement.",
      },
      {
        kind: "clause",
        number: "8.",
        heading: "Refund Policy",
        intro: "The Client(s) acknowledges that the granting of a visa or status and the time required for processing this application is at the sole discretion of the government and not the HMARK Consultants.",
      },
      {
        kind: "bullet",
        text: "The client(s) agrees that the above professional fees are non-refundable once work has commenced on behalf of the client. Should the termination of the services either on the consultants or the company's part take place, all monies earned by the consultant or the company as well as any disbursement paid or owed on my behalf by the company will be deducted from the professional fees. The client agrees that should the fees paid to date not cover any expense owed; said fees will be due and payable upon termination of the services.",
      },
      { kind: "bullet", text: "There shall be no refund payable to the client where the client unilaterally terminates or abandons this agreement." },
      {
        kind: "bullet",
        text: "In the event that the CLIENT chooses to terminate this agreement prior to either of the events made registration with HMARK Consultants or submitted for student visa to Italy, the full amount of the agreement client has to pay.",
      },
      {
        kind: "bullet",
        text: "HMARK Consultants will assist the client for September 2027 intake. In case of no admission/acceptance in any Italian Public University, with the client's consent, HMARK Consultants will assist the client for the next year 2028.",
      },
      {
        kind: "bullet",
        text: "The client understands that a refusal from university based on the medical condition, criminality, fraudulent documents, false or misleading information or the ability to meet the admissibility requirements will not be the responsibility of the consultant or the company and there will be no refund made in this condition.",
      },
      {
        kind: "bullet",
        text: "In case of student admission refused or application returned due to capped in the particular profession regardless application launching date and receiving date at any university any amount paid to HMARK Consultants neither refund or adjusted.",
      },
      {
        kind: "bullet",
        text: "In case of visa rejection from the embassy, there will be no refund made to the client. The paid consultation fee is limited to the admission in public universities of Italy only.",
      },
      {
        kind: "bullet",
        text: "In case of rejection from the university, the total consultancy fee (only) will be refunded to the client within 90 working days via bank transfer or check.",
      },
      { kind: "bullet", text: "The client allows the consultant to apply again in the upcoming semester in case of rejection from the university." },
      {
        kind: "bullet",
        text: "In case of not passing the IMAT, TOLC or any required exam by the university, the admission or pre-enrollment will be void therefore, there will be no refund made to the client.",
      },
      {
        kind: "paragraph",
        text: "If, however, the application is denied because of an error or omission on the part of HMARK Consultants or professional staff, the HMARK Consultants will refund all professional fees collected and the administrative charges will be non-refundable. The Client(s) agrees that the fees paid are for services indicated above, and any refund is strictly limited to the amount of fees paid.",
      },
      { kind: "subheading", text: "Dispute Resolution" },
      {
        kind: "paragraph",
        text: "Please be noted that HMARK Consultants is an official representative of the private universities it represents. HMARK Consultants is not an official representative of any public University of Italy and only processes the admission application on behalf of the client's consent.",
      },
      {
        kind: "paragraph",
        text: "In the event of dispute, the Client(s) and HMARK Consultants are to make every effort to resolve the matter between the two parties. In the event a resolution cannot be reached, the Client(s) are to make a complaint in writing to HMARK Consultants and allow the HMARK Consultants 30 to 60 days to respond to the Client(s). In the event the dispute is still unresolved, the Client(s) may follow the complaint and discipline procedure outlined by the university you applied for.",
      },
      {
        kind: "clause",
        number: "9.",
        heading: "Confidentiality",
        intro:
          "All information and documentation reviewed by the university, required by embassy or any governing bodies, and used for the preparation of the application will not be divulged to any third party, other than agent and employees, without prior consent, except and demanded by the law. The Client(s) agrees to keep all the process and information confidential from any third parties.",
      },
      {
        kind: "clause",
        number: "10.",
        heading: "Force Majeure",
        intro:
          "The HMARK Consultants failure to perform any term of this Retainers Agreement a result of conditions beyond his/her control such as, but not limited to, governmental restrictions or subsequent legalization, war, strikes, or acts of God, shall not be deemed a breach of this agreement.",
      },
      {
        kind: "clause",
        number: "11.",
        heading: "Change Policy",
        intro:
          "The Client(s) acknowledge that if the university or embassy ask to act on the Client(s) behalf on matter other than those outlined above in the Agreement, or because of a material change in the Client(s) circumstances, or because of material facts not disclosed at the outset of the application, or because change in the government legislation regarding the process of student visa related application, the Agreement can be modified accordingly upon mutual agreement.",
      },
      {
        kind: "clause",
        number: "12.",
        heading: "Others",
        intro:
          "The Client(s) understand(s) that they must be accurate and honest in the information they provide(s) and that any inaccuracies may void this Agreement, or seriously affect the outcome of the application or the retention of any status they may obtain.",
      },
      {
        kind: "clause",
        number: "13.",
        heading: "Government Fees and University Fees",
        intro:
          "The client understands that they are responsible to pay all government, embassy and university fees.\nThe client understands that they are responsible to bear criminal records check, medical, photos and any other necessary documentation required to complete the process. In case of any changes and delays due to pandemic, HMARK Consultants will not be held responsible.",
      },
      {
        kind: "clause",
        number: "14.",
        heading: "Conditions and Obligation",
        intro:
          "The client understands that the consultant or the company will be not liable or responsible for any payment made without the signing of this agreement as well as issuance of any official receipt. Should the client withdraw their application at this stage, the client understands there are no refunds for the services rendered and client has to pay full amount as decided in total if cancellation of agreement occurred. The client understands that a refusal based on the medical condition, criminality, fraudulent documents, false or misleading information or the ability to meet the admissibility requirements will not be the responsibility of the consultant or the company.",
      },
      {
        kind: "clause",
        number: "15.",
        heading: "NOTE: AT THE TIME OF STUDENT VISA APPLICATION",
        intro:
          "Proof of sufficient funds to cover your tuition and living expenses for at least your whole course in Italy. Please submit: copies of your bank statement of the last six months (Must). Any additional supporting documents demonstrating a reliable source of funds (notarized letter of undertaking and financial documents from personal or immediate family, official letter of scholarship or financial award, investment, income from rental properties, etc.) [NO BANK FINANCE ARE ALLOWED FOR ITALY VISA. YOU MUST SHOW YOUR OWN PERSONAL MONEY. THERE IS NO GUARANTEE OF VISA; WE ARE JUST RESPONSIBLE TO PROCESS YOUR APPLICATION.]",
      },
      {
        kind: "clause",
        number: "16.",
        heading: "Authority To Release Personal Information to Designated Universities",
        intro:
          "I, as a client, authorized HMARK Consultants to serve as my representative and to conduct business and do all types of correspondence on my behalf with the public universities of Italy. I am also authorized to release information from my case file and any dependent children under 18 years of age (if applicable). Also, I have fully read and understood the agreement and comply with all the clauses in this agreement.",
      },
      {
        kind: "clause",
        number: "17.",
        heading: "Courier Charges",
        intro: "Client has to bear all DHL charges once DHL launches to ITALY. We will provide a DHL tracking number every time.",
      },
    ],
  },
};

export function getAgreementContent(countryCode: string, track: string): AgreementContent | null {
  return AGREEMENT_CONTENT[`${countryCode}_${track}`] ?? null;
}
