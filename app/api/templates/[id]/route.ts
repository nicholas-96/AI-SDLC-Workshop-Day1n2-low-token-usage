import { NextResponse } from 'next/server';
import type { TemplateInput } from '@/lib/db';
import { templateDB } from '@/lib/db';
import { badRequest, parseId, readJson, requireUser } from '@/lib/http';
import { templateWriteSchema, validateTemplateRules, zodMessage } from '@/lib/validation';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const parsed = templateWriteSchema.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(zodMessage(parsed.error));
  const input: TemplateInput = {
    name: parsed.data.name,
    description: parsed.data.description ? parsed.data.description : null,
    category: parsed.data.category ? parsed.data.category : null,
    title_template: parsed.data.title_template,
    priority: parsed.data.priority ?? 'medium',
    is_recurring: parsed.data.is_recurring ?? false,
    recurrence_pattern: parsed.data.is_recurring ? parsed.data.recurrence_pattern ?? null : null,
    reminder_minutes: parsed.data.reminder_minutes ?? null,
    due_date_offset_minutes: parsed.data.due_date_offset_minutes ?? null,
    subtasks: parsed.data.subtasks,
  };
  const rulesError = validateTemplateRules(input);
  if (rulesError) return badRequest(rulesError);
  const template = templateDB.update(id, auth.session.userId, input);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json({ template });
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id == null) return badRequest('Invalid id');
  const removed = templateDB.remove(id, auth.session.userId);
  if (!removed) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
