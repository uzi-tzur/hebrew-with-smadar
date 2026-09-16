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

  const { error: deleteError } = await supabase.from('students').delete().not('id', 'is', null)
  if (deleteError) throw deleteError
  if (!students.length) return

  const { error: insertError } = await supabase.from('students').insert(students.map(({ id, name, parent, phone, accent }) => ({ id, name, parent, phone, accent })))
  if (insertError) throw insertError
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

  const { error: deleteError } = await supabase.from('classes').delete().not('id', 'is', null)
  if (deleteError) throw deleteError
  if (!classes.length) return

  const { error: insertError } = await supabase.from('classes').insert(classes.map(({ id, number, name, day, cost, studentIds }) => ({ id, number, name, day, cost, student_ids: studentIds || [] })))
  if (insertError) throw insertError
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

  const attendance = {}
    ; (data || []).forEach((record) => { attendance[`${record.class_id}:${record.attendance_date}:${record.student_id}`] = record.present })
  writeAttendance(attendance)
  return attendance
}

export async function saveAttendance(attendance) {
  writeAttendance(attendance)
  if (!supabase) return

  const { error: deleteError } = await supabase.from('attendance').delete().not('student_id', 'is', null)
  if (deleteError) throw deleteError
  const records = Object.entries(attendance).filter(([, present]) => present).map(([key]) => {
    const [classId, attendanceDate, studentId] = key.split(':')
    return { class_id: Number(classId), student_id: Number(studentId), attendance_date: attendanceDate, present: true }
  })
  if (!records.length) return
  const { error: insertError } = await supabase.from('attendance').insert(records)
  if (insertError) throw insertError
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

  const { error: deleteError } = await supabase.from('billing').delete().not('parent', 'is', null)
  if (deleteError) throw deleteError
  const records = Object.entries(billing).map(([key, value]) => {
    const separator = key.lastIndexOf(':')
    const parent = key.slice(0, separator)
    const [billingYear, billingMonth] = key.slice(separator + 1).split('-')
    return { parent, billing_month: Number(billingMonth), billing_year: Number(billingYear), amount_paid: Number(value.amountPaid || 0), payment_method: value.paymentMethod || null, balance_forward: Number(value.balanceForward || 0) }
  })
  if (!records.length) return
  const { error: insertError } = await supabase.from('billing').insert(records)
  if (insertError) throw insertError
}
