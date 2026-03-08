'use client'

import { useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Upload, RefreshCw, Layers, Database } from 'lucide-react'
import type { Patient } from './useScannerState'

interface PatientPickerProps {
  patients: Patient[]
  patientsLoading: boolean
  patientsError: string | null
  selectedPatient: Patient | null
  uploadedFile: File | null
  activeTab: 'patients' | 'upload'
  onTabChange: (tab: 'patients' | 'upload') => void
  onSelectPatient: (patient: Patient) => void
  onFileUpload: (file: File) => void
  onRefresh: () => void
}

function truncateId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

export default function PatientPicker({
  patients,
  patientsLoading,
  patientsError,
  selectedPatient,
  uploadedFile,
  activeTab,
  onTabChange,
  onSelectPatient,
  onFileUpload,
  onRefresh,
}: PatientPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileUpload(file)
    },
    [onFileUpload]
  )

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => onTabChange('patients')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'patients'
              ? 'bg-crimson/20 text-crimson border border-crimson/50'
              : 'bg-zinc-800/50 text-zinc-400 border border-white/5 hover:text-zinc-300'
          }`}
        >
          <Users size={14} />
          Patients
        </button>
        <button
          onClick={() => onTabChange('upload')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'upload'
              ? 'bg-crimson/20 text-crimson border border-crimson/50'
              : 'bg-zinc-800/50 text-zinc-400 border border-white/5 hover:text-zinc-300'
          }`}
        >
          <Upload size={14} />
          File Upload
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'patients' ? (
          <motion.div
            key="patients"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header with refresh */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-zinc-300">
                Select Patient
              </h4>
              <button
                onClick={onRefresh}
                disabled={patientsLoading}
                className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded-md hover:bg-white/5"
              >
                <RefreshCw
                  size={14}
                  className={patientsLoading ? 'animate-spin' : ''}
                />
              </button>
            </div>

            {/* Error banner */}
            {patientsError && (
              <div className="mb-3 text-xs text-amber-400/80 bg-amber-900/20 border border-amber-900/30 rounded-lg p-2">
                {patientsError}
              </div>
            )}

            {/* Patient Grid */}
            {patientsLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-lg bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
                {patients.map((patient) => {
                  const isSelected =
                    selectedPatient?.patient_id === patient.patient_id
                  return (
                    <motion.button
                      key={patient.patient_id}
                      onClick={() => onSelectPatient(patient)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`relative text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-crimson/15 border-crimson/50 shadow-crimson-glow'
                          : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                      }`}
                    >
                      <p
                        className={`text-xs font-mono truncate ${
                          isSelected ? 'text-crimson' : 'text-zinc-300'
                        }`}
                        title={patient.patient_id}
                      >
                        {truncateId(patient.patient_id)}
                      </p>
                      <div className="flex items-center gap-1 mt-2">
                        <Layers size={11} className="text-zinc-500" />
                        <span className="text-xs text-zinc-500">
                          {patient.slice_count} slices
                        </span>
                      </div>
                      <span
                        className={`inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          patient.subset === 'train'
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-purple-500/15 text-purple-400'
                        }`}
                      >
                        {patient.subset}
                      </span>
                      {isSelected && (
                        <motion.div
                          layoutId="patient-selected"
                          className="absolute inset-0 rounded-lg border-2 border-crimson/60 pointer-events-none"
                        />
                      )}
                    </motion.button>
                  )
                })}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.dicom,.dcm,.nii,.nii.gz,.zip"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-12 border-2 border-dashed border-white/15 rounded-xl text-center hover:border-white/30 hover:bg-white/[0.02] transition-colors group"
            >
              <Database
                size={32}
                className="mx-auto mb-3 text-zinc-600 group-hover:text-zinc-400 transition-colors"
              />
              {uploadedFile ? (
                <p className="text-crimson font-semibold text-sm">
                  {uploadedFile.name}
                </p>
              ) : (
                <>
                  <p className="text-zinc-400 text-sm">
                    Drop CT scan or click to browse
                  </p>
                  <p className="text-zinc-600 text-xs mt-1">
                    DICOM, NIfTI, PNG, JPEG, ZIP
                  </p>
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
