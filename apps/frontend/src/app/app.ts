import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ActionItemCard } from './action-item-card/action-item-card';
import { ActionItemForm } from './action-item-form/action-item-form';
import { MeetingApi, describeError } from './meeting-api.service';
import { ActionItem, ActionItemInput, MeetingDetail, MeetingListItem, provenanceOf } from './models';

@Component({
  selector: 'app-root',
  imports: [DatePipe, FormsModule, ActionItemCard, ActionItemForm],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly api = inject(MeetingApi);
  private detailRequest?: Subscription;

  protected readonly meetings = signal<MeetingListItem[]>([]);
  protected readonly listLoading = signal(false);
  protected readonly listError = signal<string | null>(null);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly detail = signal<MeetingDetail | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal<string | null>(null);

  protected readonly showCreate = signal(false);
  protected readonly newTitle = signal('');
  protected readonly newNotes = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly analyzing = signal(false);
  protected readonly analyzeError = signal<string | null>(null);

  protected readonly addingItem = signal(false);
  protected readonly addBusy = signal(false);
  protected readonly addError = signal<string | null>(null);

  protected readonly canCreate = computed(
    () => this.newTitle().trim().length > 0 && this.newNotes().trim().length > 0,
  );
  protected readonly createOpen = computed(
    () => this.showCreate() || (!this.listLoading() && !this.listError() && this.meetings().length === 0),
  );
  protected readonly awaitingReview = computed(
    () => (this.detail()?.actionItems ?? []).filter((item) => provenanceOf(item) === 'AI_PROPOSAL').length,
  );

  constructor() {
    this.loadMeetings();
  }

  protected loadMeetings(): void {
    this.listLoading.set(true);
    this.listError.set(null);
    this.api.listMeetings().subscribe({
      next: (meetings) => {
        this.meetings.set(meetings);
        this.listLoading.set(false);
        if (!this.selectedId() && meetings.length > 0) {
          this.select(meetings[0].id);
        }
      },
      error: (error: unknown) => {
        this.listError.set(describeError(error));
        this.listLoading.set(false);
      },
    });
  }

  protected select(id: string): void {
    if (id === this.selectedId() && !this.detailError()) {
      return;
    }
    // Dropping the previous request keeps a slow response from overwriting a newer selection.
    this.detailRequest?.unsubscribe();
    this.selectedId.set(id);
    this.detail.set(null);
    this.detailError.set(null);
    this.resetMeetingState();
    this.detailLoading.set(true);
    this.detailRequest = this.api.getMeeting(id).subscribe({
      next: (meeting) => {
        this.detail.set(meeting);
        this.detailLoading.set(false);
      },
      error: (error: unknown) => {
        this.detailError.set(describeError(error));
        this.detailLoading.set(false);
      },
    });
  }

  protected createMeeting(): void {
    if (!this.canCreate() || this.creating()) {
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    this.api.createMeeting({ title: this.newTitle().trim(), notes: this.newNotes().trim() }).subscribe({
      next: (meeting) => {
        this.creating.set(false);
        this.newTitle.set('');
        this.newNotes.set('');
        this.showCreate.set(false);
        this.meetings.update((list) => [toListItem(meeting), ...list]);
        this.detailRequest?.unsubscribe();
        this.selectedId.set(meeting.id);
        this.detail.set(meeting);
        this.detailLoading.set(false);
        this.detailError.set(null);
        this.resetMeetingState();
      },
      error: (error: unknown) => {
        this.creating.set(false);
        this.createError.set(describeError(error));
      },
    });
  }

  protected analyze(): void {
    const id = this.detail()?.id;
    if (!id || this.analyzing()) {
      return;
    }
    this.analyzing.set(true);
    this.analyzeError.set(null);
    this.api.analyzeMeeting(id).subscribe({
      next: (meeting) => {
        this.analyzing.set(false);
        this.meetings.update((list) => list.map((m) => (m.id === meeting.id ? toListItem(meeting) : m)));
        if (this.selectedId() === meeting.id) {
          this.detail.set(meeting);
        }
      },
      error: (error: unknown) => {
        this.analyzing.set(false);
        this.analyzeError.set(describeError(error));
      },
    });
  }

  protected addItem(input: ActionItemInput): void {
    const meetingId = this.detail()?.id;
    if (!meetingId || this.addBusy()) {
      return;
    }
    this.addBusy.set(true);
    this.addError.set(null);
    this.api.createActionItem(meetingId, input).subscribe({
      next: (item) => {
        this.addBusy.set(false);
        if (this.detail()?.id === meetingId) {
          this.addingItem.set(false);
          this.updateItems((items) => [...items, item]);
        }
      },
      error: (error: unknown) => {
        this.addBusy.set(false);
        if (this.detail()?.id === meetingId) {
          this.addError.set(describeError(error));
        }
      },
    });
  }

  protected onItemSaved(saved: ActionItem): void {
    this.updateItems((items) => items.map((item) => (item.id === saved.id ? saved : item)));
  }

  protected onItemDeleted(id: string): void {
    this.updateItems((items) => items.filter((item) => item.id !== id));
  }

  private updateItems(change: (items: ActionItem[]) => ActionItem[]): void {
    this.detail.update((meeting) => meeting && { ...meeting, actionItems: change(meeting.actionItems) });
  }

  /** Clears UI state that belongs to the previously shown meeting. */
  private resetMeetingState(): void {
    this.analyzeError.set(null);
    this.addingItem.set(false);
    this.addError.set(null);
  }
}

function toListItem({ id, title, createdAt, analyzedAt }: MeetingDetail): MeetingListItem {
  return { id, title, createdAt, analyzedAt };
}
