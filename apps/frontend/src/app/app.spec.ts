import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { ActionItem, MeetingDetail } from './models';

// The default of API_BASE_URL; no test overrides the token, so every URL below checks it.
const API = 'http://localhost:3001/api';

const ITEM: ActionItem = {
  id: 'i1',
  meetingId: 'm1',
  task: 'Ship the beta',
  owner: 'Dana',
  deadline: null,
  priority: 'HIGH',
  status: 'OPEN',
  source: 'AI',
  humanReviewed: false,
  createdAt: '2026-10-01T09:05:00.000Z',
};

const MEETING: MeetingDetail = {
  id: 'm1',
  title: 'Launch sync',
  notes: 'Dana ships the beta.',
  createdAt: '2026-10-01T09:00:00.000Z',
  analyzedAt: '2026-10-01T09:05:00.000Z',
  analysis: {
    id: 'a1',
    summary: 'Beta ships next week.',
    decisions: ['Ship the beta'],
    openQuestions: ['Who writes the release notes?'],
    followUpRequired: true,
    followUpDate: '2026-10-08',
    model: 'fake-model',
  },
  actionItems: [ITEM],
};

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let http: HttpTestingController;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(App);
    http = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  /** Answers the list request and the detail request of the auto-selected first meeting. */
  async function openMeeting(): Promise<void> {
    const { id, title, createdAt, analyzedAt } = MEETING;
    http.expectOne(`${API}/meetings`).flush([{ id, title, createdAt, analyzedAt }]);
    http.expectOne(`${API}/meetings/m1`).flush(MEETING);
    await fixture.whenStable();
  }

  function card(): HTMLElement {
    return element.querySelector<HTMLElement>('app-action-item-card')!;
  }

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(card().querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  }

  function type(selector: string, value: string): void {
    const field = card().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it('shows a loading state, then the meeting list', async () => {
    fixture.detectChanges();
    expect(element.querySelector('.meetings [aria-busy="true"]')?.textContent).toContain(
      'Loading meetings…',
    );
    expect(element.querySelector('.meeting')).toBeNull();

    await openMeeting();

    expect(element.textContent).not.toContain('Loading meetings…');
    const meetings = element.querySelectorAll('.meeting');
    expect(meetings.length).toBe(1);
    expect(meetings[0].textContent).toContain('Launch sync');
    expect(meetings[0].textContent).toContain('Analyzed');
    expect(meetings[0].getAttribute('aria-current')).toBe('true');
  });

  it('shows an error when the meeting list cannot be loaded', async () => {
    http.expectOne(`${API}/meetings`).error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Cannot reach the API');
    expect(element.textContent).not.toContain('Loading meetings…');
  });

  it('renders the selected meeting with its analysis as a proposal', async () => {
    await openMeeting();

    const workspace = element.querySelector('.ai')!.textContent;
    expect(workspace).toContain('AI analysis is a proposal and requires human review.');
    expect(workspace).toContain('Beta ships next week.');
    expect(workspace).toContain('Who writes the release notes?');
    expect(workspace).toContain('Follow-up required');
    expect(workspace).toContain('Oct 8, 2026');
    expect(workspace).toContain('fake-model');
    expect(workspace).toContain('1 total · 1 awaiting review');
    expect(card().textContent).toContain('Ship the beta');
    expect(card().textContent).toContain('Dana');
    expect(card().textContent).toContain('AI proposal');
  });

  it('updates an action item status via PATCH and renders the returned item', async () => {
    await openMeeting();

    const select = card().querySelector('select')!;
    select.value = 'DONE';
    select.dispatchEvent(new Event('change'));

    const request = http.expectOne({ method: 'PATCH', url: `${API}/action-items/i1` });
    expect(request.request.body).toEqual({ status: 'DONE' });
    request.flush({ ...ITEM, status: 'DONE', humanReviewed: true });
    await fixture.whenStable();

    expect(card().querySelector('.card--done')).not.toBeNull();
    expect(card().querySelector('select')!.value).toBe('DONE');
    expect(card().textContent).toContain('Human-reviewed');
    expect(button('Accept')).toBeUndefined();
    expect(element.textContent).toContain('1 total · 0 awaiting review');
  });

  it('saves a manual edit via PATCH and renders the returned item', async () => {
    await openMeeting();

    button('Edit')!.click();
    await fixture.whenStable();
    type('textarea[name="task"]', 'Ship the beta to pilot customers');
    type('input[name="owner"]', 'Priya');
    type('input[name="deadline"]', '2026-10-15');
    card().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    const request = http.expectOne({ method: 'PATCH', url: `${API}/action-items/i1` });
    expect(request.request.body).toEqual({
      task: 'Ship the beta to pilot customers',
      owner: 'Priya',
      deadline: '2026-10-15',
      priority: 'HIGH',
      status: 'OPEN',
    });
    // The server's wording differs from what was typed, to prove the response is what gets rendered.
    request.flush({
      ...ITEM,
      task: 'Ship the beta to pilot customers (server)',
      owner: 'Priya N.',
      deadline: '2026-10-15',
      humanReviewed: true,
    });
    await fixture.whenStable();

    expect(card().querySelector('form')).toBeNull();
    expect(card().querySelector('.card__task')?.textContent).toBe(
      'Ship the beta to pilot customers (server)',
    );
    expect(card().textContent).toContain('Priya N.');
    expect(card().textContent).toContain('Oct 15, 2026');
    expect(card().textContent).toContain('Human-reviewed');
  });

  it('shows the API error and keeps the item unchanged when an update fails', async () => {
    await openMeeting();

    const select = card().querySelector('select')!;
    select.value = 'DONE';
    select.dispatchEvent(new Event('change'));
    http
      .expectOne({ method: 'PATCH', url: `${API}/action-items/i1` })
      .flush({ message: ['status must be a valid enum value'] }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();

    expect(card().querySelector('[role="alert"]')?.textContent).toContain(
      'status must be a valid enum value',
    );
    expect(card().querySelector('select')!.value).toBe('OPEN');
    expect(card().querySelector('.card--done')).toBeNull();
    expect(card().textContent).toContain('AI proposal');
  });
});
