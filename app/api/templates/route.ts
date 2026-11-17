import { NextResponse } from 'next/server';
import type { TemplateInput } from '@/lib/db';
import { templateDB } from '@/lib/db';
import { badRequest, readJson, requireUser } from '@/lib/http';
import { templateWriteSchema, validateTemplateRules, zodMessage } from '@/lib/validation';

function toInput(data: {
  name: string;
  description?: string | null;
  category?: string | null;
  title_template: string;
  priority?: TemplateInput['priority'];
  is_recurring?: boolean;
  recurrence_pattern?: TemplateInput['recurrence_pattern'];
  reminder_minutes?: number | null;
  due_date_offset_minutes?: number | null;
  subtasks?: TemplateInput['subtasks'];
}): { input: TemplateInput } | { error: string } {
  const input: TemplateInput = {
    name: data.name,
    description: data.description ? data.description : null,
    category: data.category ? data.category : null,
    title_template: data.title_template,
    priority: data.priority ?? 'medium',
    is_recurring: data.is_recurring ?? false,
    recurrence_pattern: data.is_recurring ? data.recurrence_pattern ?? null : null,
    reminder_minutes: data.reminder_minutes ?? null,
    due_date_offset_minutes: data.due_date_offset_minutes ?? null,
    subtasks: data.subtasks,
  };
  const rulesError = validateTemplateRules(input);
  if (rulesError) return { error: rulesError };
  return { input };
}

export async function GET() {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ templates: templateDB.list(auth.session.userId) });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const parsed = templateWriteSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(zodMessage(parsed.error));
  const built = toInput(parsed.data);
  if ('error' in built) return badRequest(built.error);
  const template = templateDB.create(auth.session.userId, built.input);
  return NextResponse.json({ template }, { status: 201 });
}
