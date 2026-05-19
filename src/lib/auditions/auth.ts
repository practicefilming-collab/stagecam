import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type {
  AuditionScriptRelationship,
  AuditionScriptRelationshipScenarioSource,
  AuditionScriptRelationshipType,
  Profile,
} from '@/lib/types';

export interface AuditionViewerContext {
  userId: string;
  profile: Profile;
}

export interface AuditionScriptAccessContext {
  canAccess: boolean;
  canManage: boolean;
  canControlRoom: boolean;
  viewerRole: 'assigned_rehearser' | 'admin' | 'rehearsal_partner' | 'guest';
  relationshipLabel: string | null;
  relationship: AuditionScriptRelationship | null;
}

export function canAccessAuditionsMode(profile: Pick<Profile, 'is_admin' | 'auditions_enabled'>) {
  return profile.is_admin || profile.auditions_enabled;
}

export function formatAuditionRelationshipLabel(input: {
  isAssignedRehearser?: boolean;
  relationshipType?: AuditionScriptRelationshipType | null;
}) {
  if (input.isAssignedRehearser) return 'Assigned Rehearser';
  switch (input.relationshipType) {
    case 'admin_to_assignee':
      return 'Admin to Assignee';
    case 'rehearsal_partner_to_assignee':
      return 'Rehearsal Partner to Assignee';
    default:
      return null;
  }
}

export async function getAuditionViewerContext(): Promise<AuditionViewerContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return null;
  }

  return {
    userId: user.id,
    profile: profile as Profile,
  };
}

export async function ensureAdminAuditionRelationship(input: {
  admin?: ReturnType<typeof createAdminClient>;
  auditionScriptId: string;
  assignedRehearserUserId: string;
  relatedUserId: string;
  scenarioSource?: AuditionScriptRelationshipScenarioSource;
}) {
  const admin = input.admin ?? createAdminClient();
  await admin.from('audition_script_relationships').upsert({
    audition_script_id: input.auditionScriptId,
    assigned_rehearser_user_id: input.assignedRehearserUserId,
    related_user_id: input.relatedUserId,
    relationship_type: 'admin_to_assignee',
    scenario_source: input.scenarioSource ?? 'assignment_admin_access',
    room_session_id: null,
    project_codename: null,
  }, {
    onConflict: 'audition_script_id,related_user_id,relationship_type,scenario_source',
  });
}

export async function syncAdminAuditionRelationships(input: {
  admin?: ReturnType<typeof createAdminClient>;
  auditionScriptId: string;
  assignedRehearserUserId: string;
}) {
  const admin = input.admin ?? createAdminClient();
  const { data: adminProfiles } = await admin
    .from('profiles')
    .select('id')
    .eq('is_admin', true);

  for (const profile of adminProfiles ?? []) {
    await ensureAdminAuditionRelationship({
      admin,
      auditionScriptId: input.auditionScriptId,
      assignedRehearserUserId: input.assignedRehearserUserId,
      relatedUserId: String(profile.id),
    });
  }
}

export async function ensureAuditionScenarioRelationship(input: {
  admin?: ReturnType<typeof createAdminClient>;
  auditionScriptId: string;
  assignedRehearserUserId: string;
  relatedUserId: string;
  relationshipType: AuditionScriptRelationshipType;
  scenarioSource: AuditionScriptRelationshipScenarioSource;
  roomSessionId?: string | null;
  projectCodename?: string | null;
}) {
  const admin = input.admin ?? createAdminClient();
  await admin.from('audition_script_relationships').upsert({
    audition_script_id: input.auditionScriptId,
    assigned_rehearser_user_id: input.assignedRehearserUserId,
    related_user_id: input.relatedUserId,
    relationship_type: input.relationshipType,
    scenario_source: input.scenarioSource,
    room_session_id: input.roomSessionId ?? null,
    project_codename: input.projectCodename ?? null,
  }, {
    onConflict: input.roomSessionId
      ? 'audition_script_id,related_user_id,relationship_type,scenario_source,room_session_id'
      : 'audition_script_id,related_user_id,relationship_type,scenario_source',
  });
}

export async function getAuditionScriptAccessContext(input: {
  viewer: Pick<AuditionViewerContext, 'userId' | 'profile'>;
  script: {
    id: string;
    assigned_rehearser_user_id: string;
  };
}) : Promise<AuditionScriptAccessContext> {
  const isAssignedRehearser = input.script.assigned_rehearser_user_id === input.viewer.userId;

  if (isAssignedRehearser) {
    return {
      canAccess: true,
      canManage: false,
      canControlRoom: true,
      viewerRole: 'assigned_rehearser',
      relationshipLabel: formatAuditionRelationshipLabel({ isAssignedRehearser: true }),
      relationship: null,
    };
  }

  const admin = createAdminClient();

  if (input.viewer.profile.is_admin) {
    await ensureAdminAuditionRelationship({
      admin,
      auditionScriptId: input.script.id,
      assignedRehearserUserId: input.script.assigned_rehearser_user_id,
      relatedUserId: input.viewer.userId,
    });
  }

  const { data: relationship } = await admin
    .from('audition_script_relationships')
    .select('*')
    .eq('audition_script_id', input.script.id)
    .eq('related_user_id', input.viewer.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const typedRelationship = (relationship as AuditionScriptRelationship | null) ?? null;
  const canAccess = Boolean(typedRelationship);
  const isAdminRelationship = typedRelationship?.relationship_type === 'admin_to_assignee';

  return {
    canAccess,
    canManage: input.viewer.profile.is_admin,
    canControlRoom: canAccess,
    viewerRole: typedRelationship
      ? isAdminRelationship
        ? 'admin'
        : 'rehearsal_partner'
      : 'guest',
    relationshipLabel: formatAuditionRelationshipLabel({
      relationshipType: typedRelationship?.relationship_type ?? null,
    }),
    relationship: typedRelationship,
  };
}

export async function canAccessAuditionScript(
  viewer: Pick<AuditionViewerContext, 'userId' | 'profile'>,
  script: { id: string; assigned_rehearser_user_id: string },
) {
  const access = await getAuditionScriptAccessContext({ viewer, script });
  return access.canAccess;
}

export function canManageAuditionScript(viewer: Pick<AuditionViewerContext, 'profile'>) {
  return viewer.profile.is_admin;
}
