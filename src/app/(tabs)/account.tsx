import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getCurrentUser } from '../../db/queries';
import { Member } from '../../db/types';

export default function AccountScreen() {
  const [user, setUser] = useState<Member | null>(null);

  const loadUser = async () => {
    try {
      const u = await getCurrentUser();
      setUser(u);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadUser();
    }, [])
  );

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'Y'}</Text>
        </View>
        <Text style={styles.userName}>{user?.name || 'You'}</Text>
        <Text style={styles.userEmail}>{user?.email || 'me@personal.app'}</Text>
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
      </View>

      {/* Storage Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>DATA STORAGE</Text>
        <TouchableOpacity
          style={styles.rowClickable}
          onPress={() => {
            Alert.alert(
              'Local Storage',
              'All groups, expenses, and records are stored directly on your personal device.'
            );
          }}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="database-outline" size={22} color="#6B7280" />
            <Text style={styles.rowText}>Device Storage</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <View style={styles.footerNote}>
        <Text style={styles.footerText}>Simplify Expense v1.0.0</Text>
        <Text style={styles.footerSubText}>Personal expense tracker</Text>
      </View>
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
  },
  rowText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
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
});
