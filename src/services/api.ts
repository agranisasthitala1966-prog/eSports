import { SportEvent, Candidate, Club, SportsMeetSettings, EventHeat, EventResult, DatabaseDump, ClientUpload } from '../types';

// In AI Studio, the dev preview and shared preview share the same backend or origin.
// Using window.location.origin + '/api' ensures full cross-device and mobile compatibility.
const getApiBase = (): string => {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/api`;
  }
  return '/api';
};

const API_BASE = getApiBase();

export const api = {
  // Auth & PIN
  async verifyPin(pin: string): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${API_BASE}/auth/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Incorrect PIN' }));
      throw new Error(err.error || 'Incorrect PIN');
    }
    return res.json();
  },

  async resetPin(currentPin: string, newPin: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/reset-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin, newPin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to reset PIN' }));
      throw new Error(err.error || 'Failed to reset PIN');
    }
    return res.json();
  },

  // Client Uploads & Staging
  async getUploads(): Promise<ClientUpload[]> {
    const res = await fetch(`${API_BASE}/uploads`);
    if (!res.ok) throw new Error('Failed to fetch client uploads');
    return res.json();
  },

  async submitUpload(data: {
    club: string;
    clientName?: string;
    candidates: Candidate[];
    totalFees?: number;
    notes?: string;
  }): Promise<{ success: boolean; message: string; upload: ClientUpload }> {
    const res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload submission failed' }));
      throw new Error(err.error || 'Upload submission failed');
    }
    return res.json();
  },

  async mergeUpload(id: string): Promise<{ success: boolean; message: string; mergedCandidates: Candidate[]; totalServerCandidates: number; upload: ClientUpload }> {
    const res = await fetch(`${API_BASE}/uploads/${id}/merge`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to merge upload' }));
      throw new Error(err.error || 'Failed to merge upload');
    }
    return res.json();
  },

  async rejectUpload(id: string, reason?: string): Promise<{ success: boolean; message: string; upload: ClientUpload }> {
    const res = await fetch(`${API_BASE}/uploads/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error('Failed to reject upload');
    return res.json();
  },

  async deleteUpload(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/uploads/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete upload');
    return res.json();
  },

  async editUploadCandidate(id: string, candId: string, updates: Partial<Candidate>): Promise<{ success: boolean; candidate: Candidate }> {
    const res = await fetch(`${API_BASE}/uploads/${id}/candidate/${candId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update candidate in upload');
    return res.json();
  },

  async mergeSingleUploadCandidate(id: string, candId: string): Promise<{ success: boolean; message: string; candidate: Candidate }> {
    const res = await fetch(`${API_BASE}/uploads/${id}/merge-single/${candId}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to merge candidate');
    return res.json();
  },

  async rejectSingleUploadCandidate(id: string, candId: string, reason?: string): Promise<{ success: boolean; message: string; candidate: Candidate }> {
    const res = await fetch(`${API_BASE}/uploads/${id}/reject-single/${candId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error('Failed to reject candidate');
    return res.json();
  },

  async deleteUploadCandidateGlobally(candId: string): Promise<{ success: boolean }> {
    try {
      const res = await fetch(`${API_BASE}/uploads/candidate/${candId}`, {
        method: 'DELETE',
      });
      if (!res.ok) return { success: false };
      return res.json();
    } catch {
      return { success: false };
    }
  },
  // Health
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Failed to connect to server');
    return res.json();
  },

  // Events
  async getEvents(): Promise<SportEvent[]> {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error('Failed to fetch events');
    return res.json();
  },

  async saveEvent(event: SportEvent): Promise<SportEvent> {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error('Failed to save event');
    const data = await res.json();
    return data.event;
  },

  async updateEvent(evtNo: number, event: Partial<SportEvent>): Promise<SportEvent> {
    const res = await fetch(`${API_BASE}/events/${evtNo}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error('Failed to update event');
    const data = await res.json();
    return data.event;
  },

  async deleteEvent(evtNo: number): Promise<void> {
    const res = await fetch(`${API_BASE}/events/${evtNo}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete event');
  },

  async resetEvents(): Promise<SportEvent[]> {
    const res = await fetch(`${API_BASE}/events/reset`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset events');
    const data = await res.json();
    return data.events;
  },

  // Candidates
  async getCandidates(): Promise<Candidate[]> {
    const res = await fetch(`${API_BASE}/candidates`);
    if (!res.ok) throw new Error('Failed to fetch candidates from server');
    return res.json();
  },

  async saveCandidate(candidate: Partial<Candidate>): Promise<Candidate> {
    const res = await fetch(`${API_BASE}/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    });
    if (!res.ok) throw new Error('Failed to save candidate to server');
    const data = await res.json();
    return data.candidate;
  },

  async updateCandidate(id: string, candidate: Partial<Candidate>): Promise<Candidate> {
    const res = await fetch(`${API_BASE}/candidates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update candidate on server');
    }
    const data = await res.json();
    return data.candidate;
  },

  async deleteCandidate(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/candidates/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete candidate on server');
    }
  },

  async cancelCandidateChest(id: string): Promise<{ success: boolean; message: string; candidate: Candidate }> {
    const res = await fetch(`${API_BASE}/candidates/${id}/cancel-chest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to cancel candidate chest number');
    }
    return res.json();
  },

  // Incremental Sync
  async syncCandidates(candidates: Candidate[]): Promise<{
    success: boolean;
    syncedCount: number;
    savedIds: string[];
    updatedCandidates?: Candidate[];
    serverTimestamp: string;
    totalServerCandidates: number;
  }> {
    const res = await fetch(`${API_BASE}/candidates/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates }),
    });
    if (!res.ok) throw new Error('Failed to synchronize candidates');
    return res.json();
  },

  // Clubs
  async getClubs(): Promise<Club[]> {
    const res = await fetch(`${API_BASE}/clubs`);
    if (!res.ok) throw new Error('Failed to fetch clubs');
    return res.json();
  },

  async saveClub(club: Partial<Club>): Promise<Club> {
    const res = await fetch(`${API_BASE}/clubs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(club),
    });
    if (!res.ok) throw new Error('Failed to save club');
    const data = await res.json();
    return data.club;
  },

  async updateClub(id: string, club: Partial<Club>): Promise<Club> {
    const res = await fetch(`${API_BASE}/clubs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(club),
    });
    if (!res.ok) throw new Error('Failed to update club');
    const data = await res.json();
    return data.club;
  },

  async deleteClub(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/clubs/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete club');
  },

  // Settings
  async getSettings(): Promise<SportsMeetSettings> {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(settings: Partial<SportsMeetSettings>): Promise<SportsMeetSettings> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    const data = await res.json();
    return data.settings;
  },

  // Heats
  async getHeats(): Promise<EventHeat[]> {
    const res = await fetch(`${API_BASE}/heats`);
    if (!res.ok) throw new Error('Failed to fetch heats');
    return res.json();
  },

  async saveHeat(heat: Partial<EventHeat>): Promise<EventHeat> {
    const res = await fetch(`${API_BASE}/heats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(heat),
    });
    if (!res.ok) throw new Error('Failed to save heat');
    const data = await res.json();
    return data.heat;
  },

  async deleteHeat(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/heats/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete heat');
  },

  // Results
  async getResults(): Promise<EventResult[]> {
    const res = await fetch(`${API_BASE}/results`);
    if (!res.ok) throw new Error('Failed to fetch results');
    return res.json();
  },

  async saveResult(result: Partial<EventResult>): Promise<EventResult> {
    const res = await fetch(`${API_BASE}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to save result');
    }
    const data = await res.json();
    return data.result;
  },

  // Database Ops
  async exportDatabase(): Promise<DatabaseDump> {
    const res = await fetch(`${API_BASE}/db/export`);
    if (!res.ok) throw new Error('Failed to export database');
    return res.json();
  },

  async restoreDatabase(dump: any): Promise<{ success: boolean; message: string; stats: any }> {
    const res = await fetch(`${API_BASE}/db/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dump),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to restore database');
    }
    return res.json();
  },

  async seedSampleData(): Promise<{ success: boolean; message: string; count: number; candidates: Candidate[] }> {
    const res = await fetch(`${API_BASE}/db/sample-data`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to seed sample data');
    return res.json();
  },

  async clearDatabase(): Promise<void> {
    const res = await fetch(`${API_BASE}/db/clear`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to clear database');
  },

  // Direct Table Ops for DB Explorer
  async getRawTable(table: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/db/raw/${table}`);
    if (!res.ok) throw new Error(`Failed to load table ${table}`);
    return res.json();
  },

  async createRawRow(table: string, data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/db/raw/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to create row in ${table}`);
    return res.json();
  },

  async updateRawRow(table: string, id: string, data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/db/raw/${table}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update row in ${table}`);
    return res.json();
  },

  // Aliases & Utilities
  async saveSettings(settings: SportsMeetSettings): Promise<SportsMeetSettings> {
    return this.updateSettings(settings);
  },

  async getDatabaseDump(): Promise<DatabaseDump> {
    return this.exportDatabase();
  },

  async restoreDatabaseDump(dump: any): Promise<{ success: boolean; message: string; stats: any }> {
    return this.restoreDatabase(dump);
  },

  async resetToDefaults(): Promise<any> {
    return this.seedSampleData();
  },
};

