import { createClient } from '@supabase/supabase-js'

const localKey = 'hebrew-with-smadar-students-v2'
const classesKey = 'hebrew-with-smadar-classes-v1'
const classesBackupKey = 'hebrew-with-smadar-classes-backup-v1'
const attendanceKey = 'hebrew-with-smadar-attendance-v1'
const billingKey = 'hebrew-with-smadar-billing-v1'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lqjvhyygrlhykhverlgc.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

export const storageMode = supabase ? 'cloud' : 'local'

function readLocal() {
  try {
    const value = JSON.parse(localStorage.getItem(localKey) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function writeLocal(students) {
  localStorage.setItem(localKey, JSON.stringify(students))
}

function readClasses() {
  try {
    const current = JSON.parse(localStorage.getItem(classesKey) || '[]')
    if (Array.isArray(current) && current.length) return current
    const backup = JSON.parse(localStorage.getItem(classesBackupKey) || '[]')
    return Array.isArray(backup) ? backup : []
  } catch {
    return []
  }
}

function writeClasses(classes) {
  localStorage.setItem(classesKey, JSON.stringify(classes))
  if (classes.length) localStorage.setItem(classesBackupKey, JSON.stringify(classes))
}

function readAttendance() {
  try {
    const value = JSON.parse(localStorage.getItem(attendanceKey) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writeAttendance(attendance) {
  localStorage.setItem(attendanceKey, JSON.stringify(attendance))
}

function readBilling() {
  try {
    const value = JSON.parse(localStorage.getItem(billingKey) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writeBilling(billing) {
  localStorage.setItem(billingKey, JSON.stringify(billing))
}

export async function loadStudents() {
  const localStudents = readLocal()
  if (!supabase) return localStudents

  const { data, error } = await supabase.from('students').select('id, name, parent, phone, accent').order('created_at', { ascending: true })
  if (error) throw error

  const students = data || []
  if (!students.length && localStudents.length) {
    await saveStudents(localStudents)
    return localStudents
  }
  writeLocal(students)
  return students
}

export async function saveStudents(students) {
  writeLocal(students)
  if (!supabase) return

  if (!students.length) return

  // Upsert only: deleting students cascades to their attendance.
  const { error } = await supabase.from('students').upsert(students.map(({ id, name, parent, phone, accent }) => ({ id, name, parent, phone, accent })), { onConflict: 'id' })
  if (error) throw error
}

export async function deleteStudent(id) {
  if (!supabase) return
  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) throw error
}

export async function loadClasses() {
  const localClasses = readClasses()
  if (!supabase) return localClasses

  let data
  try {
    const result = await supabase.from('classes').select('id, number, name, day, cost, student_ids').order('created_at', { ascending: true })
    if (result.error) throw result.error
    data = result.data
  } catch {
    return localClasses
  }

  const classes = (data || []).map(({ student_ids: studentIds, ...group }) => ({ ...group, studentIds: studentIds || [] }))
  if (!classes.length && localClasses.length) {
    await saveClasses(localClasses)
    return localClasses
  }
  writeClasses(classes)
  return classes
}

export async function saveClasses(classes) {
  writeClasses(classes)
  if (!supabase) return

  if (!classes.length) return

  // Upsert only: deleting classes cascades to their attendance.
  const { error } = await supabase.from('classes').upsert(classes.map(({ id, number, name, day, cost, studentIds }) => ({ id, number, name, day, cost, student_ids: studentIds || [] })), { onConflict: 'id' })
  if (error) throw error
}

export async function deleteClass(id) {
  if (!supabase) return
  const { error } = await supabase.from('classes').delete().eq('id', id)
  if (error) throw error
}

export async function loadAttendance() {
  const localAttendance = readAttendance()
  if (!supabase) return localAttendance

  let data
  try {
    const result = await supabase.from('attendance').select('class_id, student_id, attendance_date, present')
    if (result.error) throw result.error
    data = result.data
  } catch {
    return localAttendance
  }

  // Cloud empty but this device still has marks: restore them instead of wiping the local copy.
  const localRecords = Object.entries(localAttendance).filter(([, present]) => present).map(([key]) => {
    const [classId, attendanceDate, studentId] = key.split(':')
    return { class_id: Number(classId), student_id: Number(studentId), attendance_date: attendanceDate, present: true }
  })
  if (!data?.length && localRecords.length) {
    const { error } = await supabase.from('attendance').upsert(localRecords, { onConflict: 'class_id,student_id,attendance_date' })
    if (error) console.error('Could not restore attendance from this device', error)
    return localAttendance
  }

  const attendance = {}
    ; (data || []).forEach((record) => { attendance[`${record.class_id}:${record.attendance_date}:${record.student_id}`] = record.present })
  writeAttendance(attendance)
  return attendance
}

// Saves a single mark so one device can't overwrite marks made on another.
export async function saveAttendanceMark(attendance, key) {
  writeAttendance(attendance)
  if (!supabase) return

  const [classId, attendanceDate, studentId] = key.split(':')
  const record = { class_id: Number(classId), student_id: Number(studentId), attendance_date: attendanceDate }
  const { error } = attendance[key]
    ? await supabase.from('attendance').upsert({ ...record, present: true }, { onConflict: 'class_id,student_id,attendance_date' })
    : await supabase.from('attendance').delete().match(record)
  if (error) throw error
}

export async function loadBilling() {
  const localBilling = readBilling()
  if (!supabase) return localBilling

  try {
    const { data, error } = await supabase.from('billing').select('parent, billing_month, billing_year, amount_paid, payment_method, balance_forward')
    if (error) throw error
    const billing = {}
      ; (data || []).forEach((record) => {
        billing[`${record.parent}:${record.billing_year}-${String(record.billing_month).padStart(2, '0')}`] = {
          amountPaid: Number(record.amount_paid || 0),
          paymentMethod: record.payment_method || '',
          balanceForward: Number(record.balance_forward || 0)
        }
      })
    writeBilling(billing)
    return billing
  } catch {
    return localBilling
  }
}

export async function saveBilling(billing) {
  writeBilling(billing)
  if (!supabase) return

  const records = Object.entries(billing).map(([key, value]) => {
    const separator = key.lastIndexOf(':')
    const parent = key.slice(0, separator)
    const [billingYear, billingMonth] = key.slice(separator + 1).split('-')
    return { parent, billing_month: Number(billingMonth), billing_year: Number(billingYear), amount_paid: Number(value.amountPaid || 0), payment_method: value.paymentMethod || null, balance_forward: Number(value.balanceForward || 0) }
  })
  if (!records.length) return
  const { error } = await supabase.from('billing').upsert(records, { onConflict: 'parent,billing_month,billing_year' })
  if (error) throw error
}

const backupTables = {
  students: { columns: 'id, name, parent, phone, accent', conflict: 'id' },
  classes: { columns: 'id, number, name, day, cost, student_ids', conflict: 'id' },
  attendance: { columns: 'class_id, student_id, attendance_date, present', conflict: 'class_id,student_id,attendance_date' },
  billing: { columns: 'parent, billing_month, billing_year, amount_paid, payment_method, balance_forward', conflict: 'parent,billing_month,billing_year' }
}
const keepSnapshots = 30

export function backupSummary(backup) {
  return Object.fromEntries(Object.keys(backupTables).map((table) => [table, (backup[table] || []).length]))
}

function localBackup() {
  const attendance = Object.entries(readAttendance()).filter(([, present]) => present).map(([key]) => {
    const [classId, attendanceDate, studentId] = key.split(':')
    return { class_id: Number(classId), student_id: Number(studentId), attendance_date: attendanceDate, present: true }
  })
  const billing = Object.entries(readBilling()).map(([key, value]) => {
    const separator = key.lastIndexOf(':')
    const [billingYear, billingMonth] = key.slice(separator + 1).split('-')
    return { parent: key.slice(0, separator), billing_month: Number(billingMonth), billing_year: Number(billingYear), amount_paid: Number(value.amountPaid || 0), payment_method: value.paymentMethod || null, balance_forward: Number(value.balanceForward || 0) }
  })
  return {
    students: readLocal().map(({ id, name, parent, phone, accent }) => ({ id, name, parent, phone, accent })),
    classes: readClasses().map(({ id, number, name, day, cost, studentIds }) => ({ id, number, name, day, cost, student_ids: studentIds || [] })),
    attendance,
    billing
  }
}

export async function exportData() {
  let tables
  if (!supabase) {
    tables = localBackup()
  } else {
    tables = {}
    for (const [table, { columns }] of Object.entries(backupTables)) {
      const { data, error } = await supabase.from(table).select(columns)
      if (error) throw error
      tables[table] = data || []
    }
  }
  return { app: 'hebrew-with-smadar', version: 1, createdAt: new Date().toISOString(), ...tables }
}

// Merges a backup into the current data: rows in the backup are added or overwritten, nothing is deleted.
export async function importData(backup) {
  if (backup?.app !== 'hebrew-with-smadar' || !Object.keys(backupTables).every((table) => Array.isArray(backup[table]))) {
    throw new Error('This file is not a Hebrew with Smadar backup.')
  }
  if (!supabase) {
    const current = localBackup()
    const merge = (table, key) => [...new Map([...current[table], ...backup[table]].map((row) => [key(row), row])).values()]
    writeLocal(merge('students', (row) => row.id))
    writeClasses(merge('classes', (row) => row.id).map(({ student_ids: studentIds, ...group }) => ({ ...group, studentIds: studentIds || [] })))
    writeAttendance(Object.fromEntries(merge('attendance', (row) => `${row.class_id}:${row.attendance_date}:${row.student_id}`).map((row) => [`${row.class_id}:${row.attendance_date}:${row.student_id}`, true])))
    writeBilling(Object.fromEntries(merge('billing', (row) => `${row.parent}:${row.billing_year}-${row.billing_month}`).map((row) => [`${row.parent}:${row.billing_year}-${String(row.billing_month).padStart(2, '0')}`, { amountPaid: Number(row.amount_paid || 0), paymentMethod: row.payment_method || '', balanceForward: Number(row.balance_forward || 0) }])))
    return
  }
  // Students and classes first: attendance rows reference them.
  for (const [table, { conflict }] of Object.entries(backupTables)) {
    if (!backup[table].length) continue
    const { error } = await supabase.from(table).upsert(backup[table], { onConflict: conflict })
    if (error) throw error
  }
}

export async function listSnapshots() {
  if (!supabase) return null
  const { data, error } = await supabase.from('backups').select('id, created_at, summary, reason').order('created_at', { ascending: false })
  if (error) return null
  return data || []
}

export async function getSnapshot(id) {
  const { data, error } = await supabase.from('backups').select('data').eq('id', id).single()
  if (error) throw error
  return data.data
}

export async function createSnapshot(reason = 'manual') {
  if (!supabase) return false
  const backup = await exportData()
  const summary = backupSummary(backup)
  if (!Object.values(summary).some(Boolean)) return false
  const { error } = await supabase.from('backups').insert({ data: backup, summary, reason })
  if (error) throw error
  const { data: old } = await supabase.from('backups').select('id').order('created_at', { ascending: false }).range(keepSnapshots, keepSnapshots + 100)
  if (old?.length) await supabase.from('backups').delete().in('id', old.map((row) => row.id))
  return true
}

// One automatic cloud snapshot per day, taken when the app opens.
export async function autoSnapshot() {
  if (!supabase) return
  const { data, error } = await supabase.from('backups').select('created_at').order('created_at', { ascending: false }).limit(1)
  if (error) return
  if (data?.length && Date.now() - new Date(data[0].created_at).getTime() < 20 * 60 * 60 * 1000) return
  await createSnapshot('daily').catch(() => {})
}
