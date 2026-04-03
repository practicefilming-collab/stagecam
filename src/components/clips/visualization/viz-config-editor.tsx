'use client';

import { useState } from 'react';
import type { ClipVisualizationConfig, ClipVizPreset } from '@/lib/types';

interface VizConfigEditorProps {
  clipId: string;
  config: ClipVisualizationConfig;
  onSaved: () => void;
}

const PRESETS: { value: ClipVizPreset; label: string; desc: string }[] = [
  { value: 'waveform_pulse', label: 'Waveform', desc: 'Gentle pulse + full ring' },
  { value: 'particle_burst', label: 'Particles', desc: 'Strong pulse + heavy burst' },
  { value: 'glow_ring', label: 'Glow', desc: 'Silhouette + glowing ring' },
  { value: 'silhouette_bounce', label: 'Bounce', desc: 'Bouncing silhouette' },
  { value: 'minimal_text', label: 'Minimal', desc: 'Initials only' },
];

export default function VizConfigEditor({ clipId, config, onSaved }: VizConfigEditorProps) {
  const [preset, setPreset] = useState<ClipVizPreset>(config.style_preset);
  const [primary, setPrimary] = useState(config.color_palette.primary);
  const [secondary, setSecondary] = useState(config.color_palette.secondary);
  const [accent, setAccent] = useState(config.color_palette.accent);
  const [reactivity, setReactivity] = useState(Math.round(config.beat_reactivity_intensity * 100));
  const [energyMapping, setEnergyMapping] = useState(config.energy_mapping);
  const [saving, setSaving] = useState(false);

  const dirty =
    preset !== config.style_preset ||
    primary !== config.color_palette.primary ||
    secondary !== config.color_palette.secondary ||
    accent !== config.color_palette.accent ||
    reactivity !== Math.round(config.beat_reactivity_intensity * 100) ||
    energyMapping !== config.energy_mapping;

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/clips/${clipId}/visualization`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        style_preset: preset,
        color_palette: { primary, secondary, accent },
        beat_reactivity_intensity: reactivity / 100,
        energy_mapping: energyMapping,
      }),
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium">Visualization</h2>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-gold text-black rounded-lg text-xs font-medium hover:bg-gold-dim transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>

      {/* Preset picker */}
      <div className="mb-4">
        <p className="text-xs text-muted mb-2">Style Preset</p>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                preset === p.value
                  ? 'border-gold text-gold bg-gold/10'
                  : 'border-border text-muted hover:text-foreground hover:border-border'
              }`}
            >
              <span className="block">{p.label}</span>
              <span className="block text-[10px] opacity-60 mt-0.5">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="mb-4">
        <p className="text-xs text-muted mb-2">Color Palette</p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
            <span className="text-xs text-muted">Primary</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
            <span className="text-xs text-muted">Secondary</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
            <span className="text-xs text-muted">Accent</span>
          </label>
        </div>
      </div>

      {/* Reactivity slider */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted">Beat Reactivity</p>
          <span className="text-xs font-mono text-muted">{reactivity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={reactivity}
          onChange={(e) => setReactivity(parseInt(e.target.value))}
          className="w-full accent-gold"
        />
      </div>

      {/* Energy mapping */}
      <div>
        <p className="text-xs text-muted mb-2">Energy Mapping</p>
        <div className="flex gap-2">
          <button
            onClick={() => setEnergyMapping('auto_from_audio')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              energyMapping === 'auto_from_audio'
                ? 'border-gold text-gold bg-gold/10'
                : 'border-border text-muted'
            }`}
          >
            Auto from audio
          </button>
          <button
            onClick={() => setEnergyMapping('manual_override')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              energyMapping === 'manual_override'
                ? 'border-gold text-gold bg-gold/10'
                : 'border-border text-muted'
            }`}
          >
            Manual override
          </button>
        </div>
      </div>

      {/* Avatar path (read-only for now) */}
      {config.creator_avatar_path && (
        <div className="mt-4">
          <p className="text-xs text-muted">Avatar: {config.creator_avatar_path}</p>
        </div>
      )}
    </div>
  );
}
