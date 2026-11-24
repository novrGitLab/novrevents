import { Prisma, prisma, type Db, type Tx } from '../../lib/db.js'
import type { FormField, FormRule } from '../../generated/prisma/client.js'
import type {
  ConditionGroup,
  FieldDef,
  FieldOption,
  FieldValidation,
  FormDefinition,
  StepDef,
} from './engine/index.js'

/** Conversion between the engine's `FormDefinition` and the form_versions/fields/rules tables. */

export interface LoadedVersion {
  id: string
  version: number
  publishedAt: Date | null
  definition: FormDefinition
  /** Database rows by question key; answers reference `FormField.id`. */
  fieldRows: Map<string, FormField>
}

function toFieldDef(row: FormField): FieldDef {
  const field: FieldDef = {
    key: row.key,
    type: row.type,
    label: row.label,
    description: row.description,
    placeholder: row.placeholder,
    required: row.required,
    role: row.role,
    stepKey: row.stepKey,
  }
  if (row.options) field.options = row.options as unknown as FieldOption[]
  if (row.validation) field.validation = row.validation as unknown as FieldValidation
  return field
}

function toRuleDef(row: FormRule) {
  return {
    key: row.key,
    type: row.type,
    name: row.name,
    conditions: row.conditions as unknown as ConditionGroup,
    targetFieldKeys: row.targetFieldKeys,
    enabled: row.enabled,
  }
}

export async function loadVersion(db: Db, versionId: string): Promise<LoadedVersion> {
  const version = await db.formVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { fields: { orderBy: { position: 'asc' } }, rules: { orderBy: { position: 'asc' } } },
  })
  return {
    id: version.id,
    version: version.version,
    publishedAt: version.publishedAt,
    definition: {
      steps: version.steps as unknown as StepDef[],
      fields: version.fields.map(toFieldDef),
      rules: version.rules.map(toRuleDef),
    },
    fieldRows: new Map(version.fields.map((row) => [row.key, row])),
  }
}

/** The editable draft version of a form, if it has one. */
export async function findDraftVersion(db: Db, formId: string) {
  return db.formVersion.findFirst({
    where: { formId, publishedAt: null },
    orderBy: { version: 'desc' },
    select: { id: true, version: true },
  })
}

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue

/** Replaces the fields and rules of a draft version. Never call this for a published version. */
export async function writeDefinition(
  tx: Tx,
  versionId: string,
  definition: FormDefinition,
): Promise<void> {
  await tx.formRule.deleteMany({ where: { formVersionId: versionId } })
  await tx.formField.deleteMany({ where: { formVersionId: versionId } })
  await tx.formVersion.update({ where: { id: versionId }, data: { steps: json(definition.steps) } })

  if (definition.fields.length > 0) {
    await tx.formField.createMany({
      data: definition.fields.map((field, position) => ({
        formVersionId: versionId,
        key: field.key,
        type: field.type,
        label: field.label,
        description: field.description ?? null,
        placeholder: field.placeholder ?? null,
        required: field.required,
        role: field.role ?? null,
        stepKey: field.stepKey,
        position,
        options: field.options?.length ? json(field.options) : Prisma.JsonNull,
        validation:
          field.validation && Object.keys(field.validation).length > 0
            ? json(field.validation)
            : Prisma.JsonNull,
      })),
    })
  }
  if (definition.rules.length > 0) {
    await tx.formRule.createMany({
      data: definition.rules.map((rule, position) => ({
        formVersionId: versionId,
        key: rule.key,
        type: rule.type,
        name: rule.name ?? null,
        conditions: json(rule.conditions),
        targetFieldKeys: rule.type === 'EXCLUDE' ? [] : rule.targetFieldKeys,
        position,
        enabled: rule.enabled,
      })),
    })
  }
}

/** Creates a new draft version (number = latest + 1) holding the given definition. */
export async function createDraftVersion(
  tx: Tx,
  formId: string,
  definition: FormDefinition,
  createdById: string,
): Promise<{ id: string; version: number }> {
  const latest = await tx.formVersion.aggregate({ where: { formId }, _max: { version: true } })
  const version = await tx.formVersion.create({
    data: {
      formId,
      version: (latest._max.version ?? 0) + 1,
      steps: json(definition.steps),
      createdById,
    },
    select: { id: true, version: true },
  })
  await writeDefinition(tx, version.id, definition)
  return version
}

/** Field definitions across every version of a form, newest label first — used for exports. */
export async function fieldCatalogue(formId: string) {
  const rows = await prisma.formField.findMany({
    where: { version: { formId } },
    orderBy: [{ version: { version: 'desc' } }, { position: 'asc' }],
    select: {
      key: true,
      label: true,
      type: true,
      options: true,
      version: { select: { version: true } },
    },
  })
  const catalogue = new Map<
    string,
    { key: string; label: string; type: FormField['type']; options: FieldOption[] }
  >()
  for (const row of rows) {
    if (!catalogue.has(row.key)) {
      catalogue.set(row.key, {
        key: row.key,
        label: row.label,
        type: row.type,
        options: (row.options as unknown as FieldOption[] | null) ?? [],
      })
    }
  }
  return [...catalogue.values()]
}
