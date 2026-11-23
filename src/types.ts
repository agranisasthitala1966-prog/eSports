export interface SportEvent {
  Evt_No: number;
  Evt_Name: string;
  Height: string;
  Gender: 'CHILDRENS' | 'BOYS' | 'GIRLS' | 'ALL' | string;
  Fees: number;
  requiredHit?: boolean;   // default: true
  requiredFinal?: boolean; // default: true
}

export interface Candidate {
  id: string;
  chestNo: number;
  localRecordNo?: number;
  name: string;
  club: string;
  gender: string;
  height: string;
  feeStatus?: 'Paid' | 'Due' | 'Free' | string;
  selectedEvents: number[];
  totalFees: number;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  isDirty?: boolean;
  syncedAt?: string | null;
  merged?: boolean;
  status?: 'pending' | 'merged' | 'rejected' | 'cancelled';
  isCancelled?: boolean;
  cancelledAt?: string;
  rejectionReason?: string;
}

export interface Club {
  id: string;
  Sl?: number;
  Reg_Club: string;
  Mob?: string;
  Count_1stPlace?: number;
  Count_2ndPlace?: number;
  Count_3rdPlace?: number;
  TotPoints?: number;
  // Compatibility aliases
  name: string;
  mobile?: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  shortCode?: string;
  logoUrl?: string;
}

export interface HeatParticipant {
  chestNo: number;
  candidateName: string;
  club: string;
  lane: number;
  heatNumber: number;
  qualified?: boolean;
  timeRecord?: string;
  remarks?: string;
}

export interface EventHeat {
  id: string;
  eventNo: number;
  heatNumber: number;
  participants: HeatParticipant[];
  status: 'scheduled' | 'running' | 'completed';
}

export interface FinalParticipant {
  chestNo: number;
  candidateName: string;
  club: string;
  lane: number;
  position?: number;
  resultValue?: string;
  jumpRecord?: string;
  points?: number;
  remarks?: string;
}

export interface BroadJumpRecordInfo {
  eventNo: number;
  eventName: string;
  gender: string;
  height: string;
  recordHolderName: string;
  recordHolderClub: string;
  recordYear: string;
  recordValue: string; // e.g. "14' 8\""
}

export interface EventResult {
  id: string;
  eventNo: number;
  finalists: FinalParticipant[];
  winners?: FinalParticipant[];
  completed: boolean;
  recordedAt?: string;
  targetRankCount?: number;
  cancelledChestNos?: number[];
  highestRecord?: {
    candidateName: string;
    chestNo: number;
    club: string;
    recordValue: string;
    isRecordBroken: boolean;
    previousRecordValue?: string;
    previousRecordHolder?: string;
    previousRecordYear?: string;
  };
}

export interface SportsMeetSettings {
  ordinalTitle: string; // e.g. "47th Annual Sports Meet 2027"
  registeredClubName?: string;
  registeredClubLogo?: string;
  registeredClubPhone?: string; // Digits only mobile no of registered club
  organizer: string;
  venue: string;
  dates: string;
  president: string;
  secretary: string;
  currencySymbol: string;
  autoChestStart: number;
  serverPin?: string;
  clientResponseEnabled?: boolean; // Controls whether clients can send responses to server
  broadJumpPreviousRecords?: Record<number, BroadJumpRecordInfo>;
}

export interface ClientUpload {
  id: string;
  club: string;
  clubMobile?: string;
  clientName?: string;
  uploadedAt: string;
  status: 'pending' | 'reviewed' | 'merged' | 'rejected';
  candidates: Candidate[];
  totalFees: number;
  reviewedAt?: string;
  mergedAt?: string;
  notes?: string;
}

export interface DatabaseDump {
  events: SportEvent[];
  candidates: Candidate[];
  clubs: Club[];
  results: EventResult[];
  heats: EventHeat[];
  settings: SportsMeetSettings;
  clientUploads?: ClientUpload[];
  exportedAt: string;
  version: string;
}
