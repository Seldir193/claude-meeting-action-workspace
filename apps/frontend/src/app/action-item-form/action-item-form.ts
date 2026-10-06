import { Component, OnInit, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActionItem,
  ActionItemInput,
  ActionItemPriority,
  ActionItemStatus,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUSES,
  STATUS_LABELS,
} from '../models';

/** Fields a human can set on an action item. Used for both editing and adding. */
@Component({
  selector: 'app-action-item-form',
  imports: [FormsModule],
  templateUrl: './action-item-form.html',
})
export class ActionItemForm implements OnInit {
  /** Item being edited; omit to start from a blank form. */
  readonly item = input<ActionItem | null>(null);
  readonly busy = input(false);
  readonly submitLabel = input('Save');

  readonly submitted = output<ActionItemInput>();
  readonly cancelled = output<void>();

  protected readonly statuses = STATUSES;
  protected readonly priorities = PRIORITIES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;

  protected readonly task = signal('');
  protected readonly owner = signal('');
  protected readonly deadline = signal('');
  protected readonly priority = signal<ActionItemPriority>('MEDIUM');
  protected readonly status = signal<ActionItemStatus>('OPEN');

  protected readonly canSubmit = computed(() => this.task().trim().length > 0);

  ngOnInit(): void {
    const item = this.item();
    if (item) {
      this.task.set(item.task);
      this.owner.set(item.owner ?? '');
      this.deadline.set(item.deadline ?? '');
      this.priority.set(item.priority);
      this.status.set(item.status);
    }
  }

  protected submit(): void {
    if (!this.canSubmit() || this.busy()) {
      return;
    }
    this.submitted.emit({
      task: this.task().trim(),
      // The API rejects empty strings; a blank field means "not set".
      owner: this.owner().trim() || null,
      deadline: this.deadline() || null,
      priority: this.priority(),
      status: this.status(),
    });
  }
}
