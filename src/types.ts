export interface Voter {
  serialNo?: string;
  name?: string;
  gender?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  profession?: string;
  voterId?: string;
  address?: string;
  villageName?: string;
  remarks?: string;
  
  // Normalized / cached fields
  _isMigrated?: boolean;
  _normName?: string;
  _normFather?: string;
  _normMother?: string;
  _normDob?: string;
  _normSerial?: string;
  _age?: string;
  _profession?: string;
  _gender?: string;
  _prepared?: boolean;
}

export interface VillageSummary {
  name: string;
  total: number;
  males: number;
  females: number;
}

export interface AppSearchFilters {
  serial: string;
  name: string;
  father: string;
  mother: string;
  dob: string;
  profession: string;
  gender: string;
}

export interface AppSettings {
  fullList: boolean;
  stats: boolean;
  migrated: boolean;
}

export interface SavedAppState {
  activeVillage: string;
  search: AppSearchFilters;
  settings: AppSettings;
}

export interface ActiveSessionInfo {
  sessionId: string;
  email: string;
  deviceName?: string;
  registeredAt: number;
  lastActive: number;
}

export interface CandidateProfile {
  id: string;
  name: string;
  postTitle?: string;
  religiousHeader: string;
  electionTitle: string;
  electionSubtitle: string;
  candidateBadge: string;
  candidateName: string;
  candidatePhotoUrl: string;
  symbolName: string;
  symbolPhotoUrl: string;
  symbolCallout: string;
  pollingCenter: string;
  voterArea: string;
  wardNo: string;
  isCustom?: boolean;
}

export type ElectionSlipConfig = CandidateProfile;


