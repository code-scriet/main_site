import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface RegistrationTimelineValues {
  registrationStartDate: string;
  registrationEndDate: string;
  allowLateRegistration: boolean;
  teamRegistration: boolean;
  teamMinSize: number;
  teamMaxSize: number;
}

interface RegistrationTimelineSectionProps {
  idPrefix: string;
  form: RegistrationTimelineValues;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  /** Patch-style updater for team size — sidesteps the wider/narrower form-shape issue. */
  onTeamSizeChange: (patch: { teamMinSize?: number; teamMaxSize?: number }) => void;
  /**
   * When true, the team-registration toggle is disabled with an explanatory
   * warning. Used by EditEvent to prevent changing team mode after
   * registrations have been collected.
   */
  hasRegistrations?: boolean;
  description?: string;
}

const TEAM_PRESETS = [
  { label: '2 members', min: 2, max: 2 },
  { label: '2-3 members', min: 2, max: 3 },
  { label: '2-4 members', min: 2, max: 4 },
  { label: '3-4 members', min: 3, max: 4 },
  { label: '3-5 members', min: 3, max: 5 },
  { label: '4-6 members', min: 4, max: 6 },
];

export function RegistrationTimelineSection({
  idPrefix,
  form,
  onChange,
  onTeamSizeChange,
  hasRegistrations = false,
  description,
}: RegistrationTimelineSectionProps) {
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" />
          Registration Timeline
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-registration-start`} className="text-sm font-medium text-gray-700">Registration Opens</label>
            <Input
              id={`${idPrefix}-registration-start`}
              name="registrationStartDate"
              type="datetime-local"
              value={form.registrationStartDate}
              onChange={onChange}
            />
            <p className="text-xs text-gray-500">When users can start registering</p>
          </div>
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-registration-end`} className="text-sm font-medium text-gray-700">Registration Closes</label>
            <Input
              id={`${idPrefix}-registration-end`}
              name="registrationEndDate"
              type="datetime-local"
              value={form.registrationEndDate}
              onChange={onChange}
            />
            <p className="text-xs text-gray-500">Last date to register</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-100/50 p-4">
          <div className="space-y-0.5">
            <label htmlFor="allowLateRegistration" className="text-sm font-medium text-gray-700 cursor-pointer">
              Allow Late Registration
            </label>
            <p className="text-xs text-gray-500">
              Let users register even after the event has started
            </p>
          </div>
          <label htmlFor="allowLateRegistration" className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              name="allowLateRegistration"
              id="allowLateRegistration"
              checked={form.allowLateRegistration}
              onChange={onChange}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300"></div>
          </label>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-100/50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label htmlFor="teamRegistration" className="text-sm font-medium text-gray-700 flex items-center gap-2 cursor-pointer">
                <Users className="h-4 w-4 text-amber-600" />
                Enable Team Registration
              </label>
              <p className="text-xs text-gray-500">
                Allow users to form teams for this event instead of solo registration
              </p>
              {hasRegistrations && (
                <p className="text-xs text-red-500 font-medium mt-1">
                  ⚠️ Cannot toggle team mode when registrations exist
                </p>
              )}
            </div>
            <label
              htmlFor="teamRegistration"
              className={`relative inline-flex items-center ${hasRegistrations ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                name="teamRegistration"
                id="teamRegistration"
                checked={form.teamRegistration}
                onChange={onChange}
                disabled={hasRegistrations}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"></div>
            </label>
          </div>

          <AnimatePresence>
            {form.teamRegistration && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-4 border-t border-amber-200 space-y-4">
                  <p className="text-sm font-medium text-gray-700">Team Size</p>

                  <div className="flex flex-wrap gap-2">
                    {TEAM_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => onTeamSizeChange({ teamMinSize: preset.min, teamMaxSize: preset.max })}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                          form.teamMinSize === preset.min && form.teamMaxSize === preset.max
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400 hover:bg-amber-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">Or custom:</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        id="teamMinSize"
                        min={1}
                        max={10}
                        value={form.teamMinSize}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                          onTeamSizeChange({
                            teamMinSize: val,
                            teamMaxSize: Math.max(form.teamMaxSize, val),
                          });
                        }}
                        className="w-16 text-center border-amber-200"
                      />
                      <span className="text-gray-500">to</span>
                      <Input
                        type="number"
                        id="teamMaxSize"
                        min={1}
                        max={10}
                        value={form.teamMaxSize}
                        onChange={(e) => {
                          const val = Math.max(form.teamMinSize, Math.min(10, parseInt(e.target.value) || form.teamMinSize));
                          onTeamSizeChange({ teamMaxSize: val });
                        }}
                        className="w-16 text-center border-amber-200"
                      />
                      <span className="text-sm text-gray-500">members</span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    Teams need {form.teamMinSize === form.teamMaxSize
                      ? `exactly ${form.teamMinSize}`
                      : `${form.teamMinSize}-${form.teamMaxSize}`} members to be complete.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
