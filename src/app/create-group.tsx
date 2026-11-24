import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAllMembers, createGroup } from '../db/queries';
import { Member, Group } from '../db/types';

export default function CreateGroupScreen() {
  const router = useRouter();

  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<Group['type']>('home');
  const [friends, setFriends] = useState<Member[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const all = await getAllMembers();
      // filter out self from selection
      setFriends(all.filter((m) => m.is_user === 0));
    }
    load();
  }, []);

  const toggleFriend = (id: string) => {
    if (selectedFriendIds.includes(id)) {
      setSelectedFriendIds(selectedFriendIds.filter((item) => item !== id));
    } else {
      setSelectedFriendIds([...selectedFriendIds, id]);
    }
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert('Group Name Required', 'Please enter a name for the group.');
      return;
    }

    try {
      await createGroup(groupName.trim(), groupType, 'INR', selectedFriendIds);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create group');
    }
  };

  const types: { key: Group['type']; label: string; icon: any }[] = [
    { key: 'home', label: 'Apartment / Home', icon: 'home-outline' },
    { key: 'trip', label: 'Trip / Vacation', icon: 'airplane-outline' },
    { key: 'couple', label: 'Couple', icon: 'heart-outline' },
    { key: 'other', label: 'Other', icon: 'receipt-outline' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Group Name</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. Summer Road Trip, Roommates"
          placeholderTextColor="#9CA3AF"
          value={groupName}
          onChangeText={setGroupName}
        />

        <Text style={styles.label}>Group Type</Text>
        <View style={styles.typeGrid}>
          {types.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeBtn, groupType === t.key && styles.typeBtnActive]}
              onPress={() => setGroupType(t.key)}
            >
              <Ionicons
                name={t.icon}
                size={22}
                color={groupType === t.key ? '#1cc29f' : '#6B7280'}
              />
              <Text
                style={[
                  styles.typeBtnText,
                  groupType === t.key && styles.typeBtnTextActive,
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Add Members</Text>
        <View style={styles.friendList}>
          {friends.map((f) => {
            const isSelected = selectedFriendIds.includes(f.id);
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.friendRow, isSelected && styles.friendRowActive]}
                onPress={() => toggleFriend(f.id)}
              >
                <Ionicons
                  name={isSelected ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={isSelected ? '#1cc29f' : '#9CA3AF'}
                />
                <Text style={styles.friendName}>{f.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
          <Text style={styles.createBtnText}>Create Group</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
    flexBasis: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  typeBtnActive: {
    borderColor: '#1cc29f',
    backgroundColor: '#E8F8F5',
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  typeBtnTextActive: {
    color: '#1cc29f',
    fontWeight: '700',
  },
  currencyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  currPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  currPillActive: {
    backgroundColor: '#1cc29f',
    borderColor: '#1cc29f',
  },
  currPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  currPillTextActive: {
    color: '#FFFFFF',
  },
  friendList: {
    gap: 8,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  friendRowActive: {},
  friendName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  createBtn: {
    backgroundColor: '#1cc29f',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
