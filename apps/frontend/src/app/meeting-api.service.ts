import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import {
  ActionItem,
  ActionItemInput,
  CreateMeetingInput,
  MeetingDetail,
  MeetingListItem,
} from './models';

@Injectable({ providedIn: 'root' })
export class MeetingApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  listMeetings(): Observable<MeetingListItem[]> {
    return this.http.get<MeetingListItem[]>(`${this.baseUrl}/meetings`);
  }

  getMeeting(id: string): Observable<MeetingDetail> {
    return this.http.get<MeetingDetail>(`${this.baseUrl}/meetings/${id}`);
  }

  createMeeting(input: CreateMeetingInput): Observable<MeetingDetail> {
    return this.http.post<MeetingDetail>(`${this.baseUrl}/meetings`, input);
  }

  analyzeMeeting(id: string): Observable<MeetingDetail> {
    return this.http.post<MeetingDetail>(`${this.baseUrl}/meetings/${id}/analyze`, null);
  }

  createActionItem(meetingId: string, input: ActionItemInput): Observable<ActionItem> {
    return this.http.post<ActionItem>(`${this.baseUrl}/meetings/${meetingId}/action-items`, input);
  }

  /** Any update marks the item as human-reviewed on the server. */
  updateActionItem(id: string, changes: Partial<ActionItemInput>): Observable<ActionItem> {
    return this.http.patch<ActionItem>(`${this.baseUrl}/action-items/${id}`, changes);
  }

  deleteActionItem(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/action-items/${id}`);
  }
}

/** Turns a failed request into one readable line for the UI. */
export function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Cannot reach the API. Check that the backend is running.';
    }
    const message: unknown = error.error?.message;
    if (Array.isArray(message)) {
      return message.join('; ');
    }
    if (typeof message === 'string' && message) {
      return message;
    }
    return `Request failed (${error.status}).`;
  }
  return 'Something went wrong. Please try again.';
}
