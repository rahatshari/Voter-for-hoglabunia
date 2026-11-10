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

export interface UserSessionData {
  sessionId: string;
  email: string;
  deviceName?: string;
  registeredAt: number;
  lastActive: number;
  isOnline: boolean;
  durationMinutes: number;
  lastSeenSecondsAgo?: number;
}

export interface SessionHistoryItem {
  id: string;
  email: string;
  sessionId: string;
  deviceName?: string;
  loginAt: number;
  logoutAt?: number;
  durationMinutes: number;
  endReason?: 'logout' | 'another_device' | 'kicked' | 'active';
}

export interface AdminSessionsResponse {
  success: boolean;
  activeUsers: UserSessionData[];
  history: SessionHistoryItem[];
  summary: {
    totalDistinctEmails: number;
    onlineCount: number;
    totalRegisteredSessions: number;
    totalHistoryCount: number;
    avgDurationMinutes: number;
  };
}

export interface AppUserRecord {
  email: string;
  name?: string;
  role: 'admin' | 'user';
  status: 'active' | 'blocked';
  createdAt: number;
  lastLoginAt?: number;
  totalMinutesSpent: number;
  currentSessionDuration?: number;
  isOnline?: boolean;
  activeSessionId?: string;
  deviceName?: string;
  lastActive?: number;
  lastPasswordChangedAt?: number | null;
}

export interface AdminPanelSummary {
  totalRegisteredUsers: number;
  onlineCount: number;
  blockedCount: number;
  totalCumulativeMinutes: number;
  avgMinutesPerUser: number;
}

export interface AdminPanelData {
  success: boolean;
  isAdmin: boolean;
  adminEmails: string[];
  users: AppUserRecord[];
  activeUsers: UserSessionData[];
  history: SessionHistoryItem[];
  summary: AdminPanelSummary;
}

export type SlipDesignStyle =
  | 'classic_voter_card'
  | 'upazila_horizontal'
  | 'poster_banner_card'
  | 'royal_framed_slip'
  | 'official_table_grid'
  | 'compact_thermal_slip';

export type VoterInfoFillMode = 'auto' | 'lined' | 'blank';

export interface CandidateProfile {
  id: string;
  templateTitle?: string;
  designStyle?: SlipDesignStyle;
  voterInfoMode?: VoterInfoFillMode;
  name: string;
  postTitle?: string;
  religiousHeader: string;
  cardBadgeText?: string;
  electionTitle: string;
  constituencyText?: string;
  electionSubtitle: string;
  candidateBadge: string;
  candidateName: string;
  candidateSuffix?: string;
  candidatePhotoUrl: string;
  symbolName: string;
  symbolPhotoUrl: string;
  symbolCallout: string;
  sloganText?: string;
  pollingCenter: string;
  voterArea: string;
  wardNo: string;
  footerLeftText?: string;
  footerCenterText?: string;
  footerRightText?: string;
  isCustom?: boolean;
}

export type ElectionSlipConfig = CandidateProfile;



