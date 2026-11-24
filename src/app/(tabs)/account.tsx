import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  getCurrentUser,
  updateCurrentUser,
  getAllCategories,
  addCustomCategory,
  deleteCustomCategory,
} from '../../db/queries';
import { exportDatabaseBackup, importDatabaseBackup } from '../../db/storage';
import { Member, CustomCategory } from '../../db/types';

export default function AccountScreen() {
  const [user, setUser] = useState<Member | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [selectedColor, setSelectedColor] = useState('#1cc29f');

  // Backup & Restore states
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [restoreJsonInput, setRestoreJsonInput] = useState('');
  const [viewJsonModalVisible, setViewJsonModalVisible] = useState(false);
  const [rawJsonContent, setRawJsonContent] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Categories states
  const [categoriesModalVisible, setCategoriesModalVisible] = useState(false);
  const [categoriesList, setCategoriesList] = useState<CustomCategory[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#1cc29f');

  const loadCategories = async () => {
    try {
      const cats = await getAllCategories();
      setCategoriesList(cats);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) {
      Alert.alert('Required', 'Please enter a category name');
      return;
    }
    try {
      await addCustomCategory({
        name: newCatName.trim(),
        color: newCatColor,
        icon: 'tag-outline',
      });
      setNewCatName('');
      await loadCategories();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add category');
    }
  };

  const handleDeleteCategory = async (name: string) => {
    Alert.alert('Delete Category', `Remove "${name}" category?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCustomCategory(name);
          await loadCategories();
        },
      },
    ]);
  };

  const avatarColors = [
    '#1cc29f',
    '#3B82F6',
    '#8B5CF6',
    '#EC4899',
    '#F59E0B',
    '#10B981',
    '#EF4444',
  ];

  const loadUser = async () => {
    try {
      const u = await getCurrentUser();
      setUser(u);
      setEditName(u.name);
      setEditEmail(u.email || '');
      setSelectedColor(u.avatar_color || '#1cc29f');
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadUser();
    }, [])
  );

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    try {
      const updated = await updateCurrentUser(editName.trim(), editEmail.trim(), selectedColor);
      setUser(updated);
      setEditModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update profile');
    }
  };

  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      const json = await exportDatabaseBackup();

      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simplify_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('Backup Exported', 'Backup JSON file has been downloaded to your computer.');
      } else {
        const filename = `simplify_backup_${new Date().toISOString().slice(0, 10)}.json`;
        const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        const fileUri = `${baseDir}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/json',
            dialogTitle: 'Export Simplify Expense Backup',
            UTI: 'public.json',
          });
        } else {
          setRawJsonContent(json);
          setViewJsonModalVisible(true);
        }
      }
    } catch (e: any) {
      Alert.alert('Export Error', e?.message || 'Could not export database backup.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleViewRawJson = async () => {
    try {
      const json = await exportDatabaseBackup();
      setRawJsonContent(json);
      setViewJsonModalVisible(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to generate backup JSON.');
    }
  };

  const handlePickFileWeb = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const text = event.target?.result as string;
            if (text) setRestoreJsonInput(text);
          };
          reader.readAsText(file);
        }
      };
      input.click();
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreJsonInput.trim()) {
      Alert.alert('Empty Input', 'Please paste your backup JSON first.');
      return;
    }

    Alert.alert(
      'Confirm Restore',
      'Restoring this backup will replace current records with the data from the backup. Are you sure you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore Now',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsRestoring(true);
              await importDatabaseBackup(restoreJsonInput.trim());
              await loadUser();
              setRestoreModalVisible(false);
              setRestoreJsonInput('');
              Alert.alert('Success', 'Backup restored successfully! All your groups and expenses have been updated.');
            } catch (e: any) {
              Alert.alert('Restore Failed', e?.message || 'Invalid backup data. Please check your JSON format.');
            } finally {
              setIsRestoring(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { backgroundColor: user?.avatar_color || '#1cc29f' }]}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'Y'}</Text>
        </View>
        <Text style={styles.userName}>{user?.name || 'You'}</Text>
        <Text style={styles.userEmail}>{user?.email || 'me@personal.app'}</Text>

        <TouchableOpacity
          style={styles.editProfileBtn}
          onPress={() => setEditModalVisible(true)}
        >
          <Ionicons name="pencil" size={14} color="#1cc29f" />
          <Text style={styles.editProfileBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>PREFERENCES</Text>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="cash-outline" size={22} color="#1cc29f" />
            <Text style={styles.rowText}>Default Currency</Text>
          </View>
          <Text style={styles.infoBadge}>INR (₹)</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="calculator-variant-outline" size={22} color="#1cc29f" />
            <Text style={styles.rowText}>Debt Simplification</Text>
          </View>
          <Text style={styles.infoBadge}>Enabled</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#1cc29f" />
            <Text style={styles.rowText}>Privacy & Ads</Text>
          </View>
          <Text style={styles.infoBadge}>Offline & Ad-Free</Text>
        </View>

        <TouchableOpacity
          style={styles.rowClickable}
          onPress={() => {
            loadCategories();
            setCategoriesModalVisible(true);
          }}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="pricetags-outline" size={22} color="#1cc29f" />
            <View>
              <Text style={styles.rowText}>Manage Categories</Text>
              <Text style={styles.rowSubtext}>Custom expense categories & colors</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Backup & Data Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>BACKUP & DATA</Text>

        <TouchableOpacity
          style={styles.rowClickable}
          onPress={handleExportBackup}
          disabled={isExporting}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="cloud-upload-outline" size={22} color="#1cc29f" />
            <View>
              <Text style={styles.rowText}>
                {isExporting ? 'Exporting Backup...' : 'Export Backup (JSON)'}
              </Text>
              <Text style={styles.rowSubtext}>Save or share an offline snapshot of your data</Text>
            </View>
          </View>
          <Ionicons name="share-outline" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rowClickable}
          onPress={() => setRestoreModalVisible(true)}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="cloud-download-outline" size={22} color="#3B82F6" />
            <View>
              <Text style={styles.rowText}>Restore from Backup</Text>
              <Text style={styles.rowSubtext}>Import expenses and groups from backup JSON</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rowClickable}
          onPress={handleViewRawJson}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="code-json" size={22} color="#6B7280" />
            <View>
              <Text style={styles.rowText}>View Raw Backup Data</Text>
              <Text style={styles.rowSubtext}>Inspect or copy your database JSON directly</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rowClickable}
          onPress={() => {
            Alert.alert(
              'Offline & Local Data',
              'All members, groups, expenses, and settlements are stored 100% locally on your device. Simplify Expense never uploads your financial data to external servers.'
            );
          }}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="shield-lock-outline" size={22} color="#10B981" />
            <View>
              <Text style={styles.rowText}>Local Device Storage</Text>
              <Text style={styles.rowSubtext}>100% offline & private</Text>
            </View>
          </View>
          <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <View style={styles.footerNote}>
        <Text style={styles.footerText}>Simplify Expense v1.0.0</Text>
        <Text style={styles.footerSubText}>Personal expense tracker</Text>
      </View>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Your Profile</Text>

            <Text style={styles.inputLabel}>Display Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your Name"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.inputLabel}>Email (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="your.email@example.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Avatar Color</Text>
            <View style={styles.colorPalette}>
              {avatarColors.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    selectedColor === c && styles.colorDotSelected,
                  ]}
                  onPress={() => setSelectedColor(c)}
                />
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveProfile}>
                <Text style={styles.modalSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Restore Backup Modal */}
      <Modal visible={restoreModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Restore from Backup</Text>
              <TouchableOpacity onPress={() => setRestoreModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Paste your exported JSON database below. Restoring will replace your current records with the data in the backup.
            </Text>

            {Platform.OS === 'web' && (
              <TouchableOpacity style={styles.pickFileBtn} onPress={handlePickFileWeb}>
                <Ionicons name="document-text-outline" size={18} color="#1cc29f" />
                <Text style={styles.pickFileBtnText}>Upload JSON File from Computer</Text>
              </TouchableOpacity>
            )}

            <TextInput
              style={styles.modalTextArea}
              value={restoreJsonInput}
              onChangeText={setRestoreJsonInput}
              placeholder="Paste backup JSON content here..."
              placeholderTextColor="#9CA3AF"
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setRestoreModalVisible(false);
                  setRestoreJsonInput('');
                }}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSaveBtn,
                  (!restoreJsonInput.trim() || isRestoring) && styles.modalBtnDisabled,
                ]}
                onPress={handleRestoreBackup}
                disabled={!restoreJsonInput.trim() || isRestoring}
              >
                <Text style={styles.modalSaveBtnText}>
                  {isRestoring ? 'Restoring...' : 'Confirm & Restore'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* View Raw JSON Modal */}
      <Modal visible={viewJsonModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Raw Backup JSON</Text>
              <TouchableOpacity onPress={() => setViewJsonModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              This is the raw offline snapshot of your Simplify Expense database.
            </Text>

            <TextInput
              style={styles.modalTextArea}
              value={rawJsonContent}
              editable={false}
              multiline
              textAlignVertical="top"
              selectTextOnFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={() => setViewJsonModalVisible(false)}
              >
                <Text style={styles.modalSaveBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Categories Management Modal */}
      <Modal visible={categoriesModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Manage Categories</Text>
              <TouchableOpacity onPress={() => setCategoriesModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Create custom categories for your expenses. These appear in Add Expense and Analytics.
            </Text>

            {/* Existing Categories List */}
            {categoriesList.length > 0 ? (
              <ScrollView style={{ maxHeight: 200, marginBottom: 12 }}>
                {categoriesList.map((cat) => (
                  <View key={cat.name} style={styles.categoryRowItem}>
                    <View style={styles.categoryRowLeft}>
                      <View style={[styles.catColorDot, { backgroundColor: cat.color }]} />
                      <Text style={styles.categoryRowName}>{cat.name}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteCategory(cat.name)}
                      style={styles.deleteCatBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyCategoriesBox}>
                <Ionicons name="pricetags-outline" size={32} color="#D1D5DB" />
                <Text style={styles.emptyCategoriesText}>
                  No categories added yet. Category sections are hidden across the app until you create one.
                </Text>
              </View>
            )}

            {/* Add New Category Form */}
            <View style={styles.addCategoryCard}>
              <Text style={styles.inputLabel}>New Category Name</Text>
              <TextInput
                style={styles.modalInput}
                value={newCatName}
                onChangeText={setNewCatName}
                placeholder="e.g. Fuel, Rent, Subscriptions"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.inputLabel}>Category Color</Text>
              <View style={styles.colorPalette}>
                {avatarColors.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      newCatColor === c && styles.colorDotSelected,
                    ]}
                    onPress={() => setNewCatColor(c)}
                  />
                ))}
              </View>

              <TouchableOpacity style={styles.addCatBtn} onPress={handleAddCategory}>
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.addCatBtnText}>Add Category</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.modalButtons, { marginTop: 12 }]}>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={() => setCategoriesModalVisible(false)}
              >
                <Text style={styles.modalSaveBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  profileHeader: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1cc29f',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  userEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  section: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  rowText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  rowSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  infoBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1cc29f',
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 10,
  },
  editProfileBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1cc29f',
  },
  footerNote: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  footerSubText: {
    fontSize: 11,
    color: '#D1D5DB',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#111827',
  },
  colorPalette: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 20,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: '#111827',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#1cc29f',
  },
  modalSaveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalCardLarge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 14,
  },
  pickFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E8F8F5',
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  pickFileBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1cc29f',
  },
  modalTextArea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#111827',
    height: 160,
    backgroundColor: '#F9FAFB',
    marginBottom: 16,
  },
  modalBtnDisabled: {
    opacity: 0.5,
  },
  categoryRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  categoryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  categoryRowName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  defaultBadge: {
    fontSize: 10,
    color: '#9CA3AF',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  deleteCatBtn: {
    padding: 4,
  },
  addCategoryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1cc29f',
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
    marginTop: 4,
  },
  addCatBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyCategoriesBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  emptyCategoriesText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
