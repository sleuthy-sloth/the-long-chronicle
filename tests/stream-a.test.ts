// Stream A tests: chronicle CRUD, skill/resource change history, schema
// validation, and persistence across a Dexie reopen. Dexie runs against
// fake-indexeddb via tests/setup.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addResource,
  addSkill,
  addStateEntry,
  archiveChronicle,
  createChronicle,
  db,
  deleteChronicle,
  deleteResource,
  deleteSkill,
  duplicateChronicle,
  getActiveChronicle,
  getSettings,
  listChronicles,
  listSkills,
  listStateChanges,
  resetDb,
  restoreChronicle,
  saveSettings,
  updateChronicle,
  updateResource,
  updateSkill,
  ChronicleDB,
} from '../src/db/database'
import { chronicleSchema, skillSchema } from '../src/db/validation'
import { newId, nowIso } from '../src/db/types'

beforeEach(async () => {
  await resetDb()
})

async function makeChronicle(title = 'The Venice Years') {
  return createChronicle({
    title,
    vampireName: 'Isabetta',
    pronouns: 'she/her',
    startingAge: 25,
    startingEra: 'late 14th century',
    startingLocation: 'Venice',
    concept: 'A glassblower’s apprentice who never left the lagoon.',
    tension: 'The old family still hunts her.',
  })
}

describe('chronicle CRUD', () => {
  it('creates a chronicle with starting values copied to current values', async () => {
    const c = await makeChronicle()
    expect(c.id).toBeTruthy()
    expect(c.chronicleId).toBe(c.id)
    expect(c.currentAge).toBe(25)
    expect(c.currentEra).toBe('late 14th century')
    expect(c.currentLocation).toBe('Venice')
    expect(c.status).toBe('In Progress')
    expect(await getActiveChronicle()).toMatchObject({ id: c.id })
  })

  it('lists, updates and deletes chronicles', async () => {
    const c = await makeChronicle()
    expect(await listChronicles()).toHaveLength(1)
    const updated = await updateChronicle(c.id, { currentAge: 120, currentEra: 'late 15th century' })
    expect(updated.currentAge).toBe(120)
    expect(updated.currentEra).toBe('late 15th century')
    expect(updated.startingAge).toBe(25)
    await deleteChronicle(c.id)
    expect(await listChronicles()).toHaveLength(0)
    expect(await getActiveChronicle()).toBeNull()
  })

  it('deleting a chronicle cascades to its skills and resources', async () => {
    const c = await makeChronicle()
    await addSkill(c.id, { name: 'Glassblowing', value: 'Master' })
    await addResource(c.id, { name: 'The glassworks', quantity: 'One workshop' })
    await deleteChronicle(c.id)
    expect(await db.skills.where('chronicleId').equals(c.id).toArray()).toHaveLength(0)
    expect(await db.resources.where('chronicleId').equals(c.id).toArray()).toHaveLength(0)
    expect(await db.characterStateChanges.where('chronicleId').equals(c.id).toArray()).toHaveLength(0)
  })

  it('duplicates a chronicle with its character, as a fresh In Progress copy', async () => {
    const c = await makeChronicle()
    await addSkill(c.id, { name: 'Glassblowing', value: 'Master' })
    await addResource(c.id, { name: 'The glassworks' })
    const copy = await duplicateChronicle(c.id)
    expect(copy.id).not.toBe(c.id)
    expect(copy.title).toBe('The Venice Years (Copy)')
    expect(copy.status).toBe('In Progress')
    expect(copy.vampireName).toBe('Isabetta')
    const copySkills = await listSkills(copy.id)
    expect(copySkills).toHaveLength(1)
    expect(copySkills[0].name).toBe('Glassblowing')
    expect(copySkills[0].id).not.toBe((await listSkills(c.id))[0].id)
    // The original is untouched.
    expect(await listChronicles()).toHaveLength(2)
  })

  it('archives and restores via status', async () => {
    const c = await makeChronicle()
    expect((await archiveChronicle(c.id)).status).toBe('Completed')
    expect((await restoreChronicle(c.id)).status).toBe('In Progress')
  })

  it('rejects a chronicle with an empty title or a negative age', async () => {
    await expect(
      createChronicle({
        title: '  ',
        vampireName: 'Isabetta',
        startingAge: 25,
        startingEra: 'late 14th century',
        startingLocation: 'Venice',
        concept: '',
      }),
    ).rejects.toThrow()
    await expect(
      createChronicle({
        title: 'Bad age',
        vampireName: 'Isabetta',
        startingAge: -5,
        startingEra: 'late 14th century',
        startingLocation: 'Venice',
        concept: '',
      }),
    ).rejects.toThrow()
  })
})

describe('skill / resource change history', () => {
  it('writes a history record on add, edit and delete', async () => {
    const c = await makeChronicle()
    const skill = await addSkill(c.id, { name: 'Glassblowing', value: 'Apprentice' })
    let history = await listStateChanges(c.id)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ kind: 'skill', field: 'created', newValue: 'Glassblowing' })

    await updateSkill(skill.id, { value: 'Master' })
    history = await listStateChanges(c.id)
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ kind: 'skill', field: 'value', oldValue: 'Apprentice', newValue: 'Master' })

    // An update that changes nothing writes no record.
    await updateSkill(skill.id, { value: 'Master' })
    expect(await listStateChanges(c.id)).toHaveLength(2)

    await deleteSkill(skill.id)
    history = await listStateChanges(c.id)
    expect(history).toHaveLength(3)
    expect(history[0]).toMatchObject({ kind: 'skill', field: 'deleted', oldValue: 'Glassblowing' })
  })

  it('records resource edits with old and new values', async () => {
    const c = await makeChronicle()
    const r = await addResource(c.id, { name: 'Coin', quantity: '12' })
    await updateResource(r.id, { quantity: '40', notes: 'Sold the ruby.' })
    const history = await listStateChanges(c.id)
    const byField = new Map(history.map((h) => [h.field, h]))
    expect(byField.get('quantity')).toMatchObject({ kind: 'resource', oldValue: '12', newValue: '40' })
    expect(byField.get('notes')).toMatchObject({ kind: 'resource', newValue: 'Sold the ruby.' })
    await deleteResource(r.id)
    expect((await listStateChanges(c.id))[0]).toMatchObject({ kind: 'resource', field: 'deleted' })
  })

  it('records free-text conditions and traits as state entries', async () => {
    const c = await makeChronicle()
    const entry = await addStateEntry(c.id, {
      kind: 'condition',
      field: 'Sunlight sensitivity',
      newValue: 'Cannot bear direct sun',
    })
    expect(entry.kind).toBe('condition')
    const history = await listStateChanges(c.id)
    expect(history).toHaveLength(1)
    expect(history[0].field).toBe('Sunlight sensitivity')
  })
})

describe('schema validation rejects bad data', () => {
  it('rejects a chronicle with a bad status, missing title, or bad dates', () => {
    const base = {
      id: newId(),
      chronicleId: newId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      title: 'Test',
      vampireName: 'V',
      startingAge: 20,
      currentAge: 20,
      startingEra: 'era',
      currentEra: 'era',
      startingLocation: 'here',
      currentLocation: 'here',
      concept: '',
      status: 'In Progress',
    }
    expect(() => chronicleSchema.parse({ ...base, status: 'Done' })).toThrow()
    expect(() => chronicleSchema.parse({ ...base, title: '' })).toThrow()
    expect(() => chronicleSchema.parse({ ...base, createdAt: 'not-a-date' })).toThrow()
    expect(() => chronicleSchema.parse({ ...base, startingAge: 1.5 })).toThrow()
    expect(chronicleSchema.parse(base).title).toBe('Test')
  })

  it('rejects a skill without a name and accepts a complete one', () => {
    const base = {
      id: newId(),
      chronicleId: newId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      name: 'Glassblowing',
    }
    expect(() => skillSchema.parse({ ...base, name: '' })).toThrow()
    expect(skillSchema.parse(base).name).toBe('Glassblowing')
  })

  it('settings round-trip through Dexie with defaults', async () => {
    const defaults = await getSettings()
    expect(defaults.theme).toBe('system')
    expect(defaults.editorFontSize).toBe(16)
    const saved = await saveSettings({ theme: 'dark', editorFontSize: 18 })
    expect(saved.theme).toBe('dark')
    expect(saved.editorFontSize).toBe(18)
    expect((await getSettings()).theme).toBe('dark')
    await expect(saveSettings({ theme: 'sepia' as never })).rejects.toThrow()
  })
})

describe('data persists across a Dexie reopen', () => {
  it('a chronicle written before close is still there after reopen', async () => {
    const c = await makeChronicle()
    await addSkill(c.id, { name: 'Glassblowing', value: 'Master' })
    await saveSettings({ theme: 'dark' })

    await db.close()
    const reopened = new ChronicleDB()
    try {
      const found = await reopened.chronicles.get(c.id)
      expect(found).toMatchObject({ title: 'The Venice Years', vampireName: 'Isabetta' })
      const skills = await reopened.skills.where('chronicleId').equals(c.id).toArray()
      expect(skills).toHaveLength(1)
      expect(skills[0].name).toBe('Glassblowing')
      const settings = await reopened.settings.get('settings')
      expect(settings?.theme).toBe('dark')
    } finally {
      await reopened.close()
      // Re-open the shared instance for the next test's resetDb().
      await db.open()
    }
  })
})
