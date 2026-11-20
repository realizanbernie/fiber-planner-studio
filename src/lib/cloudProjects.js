import { supabase } from './supabase';

export async function saveCloudProject({ userId, projectId, name, data }) {
  const record = {
    user_id: userId,
    project_name: name,
    project_data: data,
    updated_at: new Date().toISOString()
  };

  if (projectId) {
    const { data: updated, error } = await supabase
      .from('fiber_projects')
      .update(record)
      .eq('id', projectId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  const { data: created, error } = await supabase
    .from('fiber_projects')
    .insert(record)
    .select()
    .single();

  if (error) throw error;
  return created;
}

export async function listCloudProjects(userId) {
  const { data, error } = await supabase
    .from('fiber_projects')
    .select('id, project_name, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function loadCloudProject(userId, projectId) {
  const { data, error } = await supabase
    .from('fiber_projects')
    .select('id, project_name, project_data')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCloudProject(userId, projectId) {
  const { error } = await supabase
    .from('fiber_projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (error) throw error;
}
