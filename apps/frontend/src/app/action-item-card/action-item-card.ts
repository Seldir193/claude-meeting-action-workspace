import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { ActionItemForm } from '../action-item-form/action-item-form';
import { MeetingApi, describeError } from '../meeting-api.service';
import {
  ActionItem,
  ActionItemInput,
  ActionItemStatus,
  PRIORITY_LABELS,
  PROVENANCE_LABELS,
  STATUSES,
  STATUS_LABELS,
  provenanceOf,
} from '../models';

/** One action item: shows its provenance and lets a human review, edit or delete it. */
@Component({
  selector: 'app-action-item-card',
  imports: [DatePipe, ActionItemForm],
  templateUrl: './action-item-card.html',
  styleUrl: './action-item-card.scss',
})
export class ActionItemCard {
  private readonly api = inject(MeetingApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly item = input.required<ActionItem>();
  /** Locks the card while the parent runs a request that may replace it. */
  readonly disabled = input(false);

  readonly saved = output<ActionItem>();
  readonly deleted = output<string>();

  protected readonly statuses = STATUSES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly provenanceLabels = PROVENANCE_LABELS;

  protected readonly editing = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly provenance = computed(() => provenanceOf(this.item()));
  protected readonly locked = computed(() => this.busy() || this.disabled());

  protected save(changes: ActionItemInput): void {
    this.update(changes);
  }

  /** Confirms an AI proposal unchanged; the server records the review on any update. */
  protected accept(): void {
    this.update({ status: this.item().status });
  }

  protected changeStatus(select: HTMLSelectElement): void {
    this.update({ status: select.value as ActionItemStatus }, () => {
      select.value = this.item().status;
    });
  }

  protected remove(): void {
    const id = this.item().id;
    this.run(this.api.deleteActionItem(id), () => this.deleted.emit(id));
  }

  private update(changes: Partial<ActionItemInput>, onError?: () => void): void {
    this.run(
      this.api.updateActionItem(this.item().id, changes),
      (item) => {
        this.editing.set(false);
        this.saved.emit(item);
      },
      onError,
    );
  }

  private run<T>(request: Observable<T>, onSuccess: (value: T) => void, onError?: () => void): void {
    this.busy.set(true);
    this.error.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => {
        this.busy.set(false);
        this.confirmingDelete.set(false);
        onSuccess(value);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(describeError(error));
        onError?.();
      },
    });
  }
}
