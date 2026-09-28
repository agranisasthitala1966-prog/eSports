export interface SportEvent {
  Evt_No: number;
  Evt_Name: string;
  Height: string;
  Gender: 'CHILDRENS' | 'BOYS' | 'GIRLS' | 'ALL' | string;
  Fees: number;
}

export interface Candidate {
  id: string;
  chestNo: number;
  localRecordNo?: number;
  name: string;
  club: string;
  gender: string;
  height: string;
  feeStatus?: 'Paid [P]' | 'Unpaid [U]' | 'Exempted [E]' | string;
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
  name: string;
  shortCode: string;
  logoUrl: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
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
  points?: number;
}

export interface EventResult {
  id: string;
  eventNo: number;
  finalists: FinalParticipant[];
  winners?: FinalParticipant[];
  completed: boolean;
  recordedAt?: string;
}

export interface SportsMeetSettings {
  ordinalTitle: string; // e.g. "47th Annual Sports Meet 2027"
  organizer: string;
  venue: string;
  dates: string;
  president: string;
  secretary: string;
  currencySymbol: string;
  autoChestStart: number;
  serverPin?: string;
}

export interface ClientUpload {
  id: string;
  club: string;
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
