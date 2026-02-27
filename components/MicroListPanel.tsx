import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter, type Href } from 'expo-router';
import type { Wish } from '@/types/Wish';
import type { MicroList, MicroListItem } from '@/types/MicroList';
import { db } from '@/firebase';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { useMicroList } from '@/hooks/useMicroList';
import { useTheme } from '@/contexts/ThemeContext';
import {
  MicroListCard,
  ResolvedMicroListItem,
} from '@/components/MicroListCard';
import { trackEvent } from '@/helpers/analytics';
import * as logger from '@/shared/logger';

type MicroListPanelProps = {
  profileId: string | null;
  postedWishes: Wish[];
  isOwner: boolean;
};

type DraftItem = MicroListItem & { key: string };

const MAX_ITEMS = 5;
const TITLE_MAX = 60;
const NOTE_MAX = 120;

const PLACEHOLDER_ITEMS = [
  {
    id: 'sample-1',
    title: 'Choose a wish to spotlight',
    note: 'Highlight what makes it special in a quick note.',
  },
  {
    id: 'sample-2',
    title: 'Add a helpful link (optional)',
    note: 'Drop an affiliate or resource link to support discovery.',
  },
  {
    id: 'sample-3',
    title: 'Bring friends along',
    note: 'Curate up to five wishes to spark conversation.',
  },
] as const;

function MicroListPlaceholderCard({
  isOwner,
  title,
}: {
  isOwner: boolean;
  title: string;
}) {
  const { theme } = useTheme();
  const headline = isOwner
    ? 'Curate a quick highlight reel of your favorite wishes.'
    : 'This creator is still curating their micro-list.';

  return (
    <View
      style={[
        styles.placeholderCard,
        { borderColor: theme.placeholder, backgroundColor: theme.input },
      ]}
    >
      <View
        style={[
          styles.placeholderCover,
          { backgroundColor: `${theme.placeholder}33` },
        ]}
      />
      <Text style={[styles.placeholderTitle, { color: theme.text }]}>
        {title}
      </Text>
      <Text style={[styles.placeholderSubtitle, { color: theme.placeholder }]}>
        {headline}
      </Text>
      <View style={styles.placeholderList}>
        {PLACEHOLDER_ITEMS.map((item) => (
          <View
            key={item.id}
            style={[
              styles.placeholderRow,
              {
                borderColor: theme.placeholder,
                backgroundColor: theme.background,
              },
            ]}
          >
            <View style={styles.placeholderRowMeta}>
              <Text style={[styles.placeholderRowTitle, { color: theme.text }]}>
                {item.title}
              </Text>
              <Text
                style={[
                  styles.placeholderRowNote,
                  { color: theme.placeholder },
                ]}
              >
                {item.note}
              </Text>
            </View>
            <View
              style={[
                styles.placeholderThumb,
                { backgroundColor: `${theme.placeholder}55` },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

export function MicroListPanel({
  profileId,
  postedWishes,
  isOwner,
}: MicroListPanelProps) {
  const { microList, loading, persist } = useMicroList(profileId);
  const { microList: microListEnabled } = useFeatureFlags();
  const { theme } = useTheme();
  const router = useRouter();
  const [resolvedItems, setResolvedItems] = useState<ResolvedMicroListItem[]>(
    [],
  );
  const [hydrating, setHydrating] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCover, setDraftCover] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const hasTrackedOpen = useRef(false);
  const hasTrackedPreview = useRef(false);

  useEffect(() => {
    hasTrackedOpen.current = false;
    hasTrackedPreview.current = false;
  }, [profileId]);

  const wishMap = useMemo(() => {
    const map = new Map<string, Wish>();
    postedWishes.forEach((wish) => map.set(wish.id, wish));
    return map;
  }, [postedWishes]);

  const resolvedWishMap = useMemo(() => {
    const map = new Map<string, Wish>();
    resolvedItems.forEach((entry) => map.set(entry.wish.id, entry.wish));
    return map;
  }, [resolvedItems]);

  const hydrate = useCallback(
    async (items: MicroListItem[] | undefined | null) => {
      if (!items || items.length === 0) {
        setResolvedItems([]);
        return;
      }
      setHydrating(true);
      try {
        const results = await Promise.all<ResolvedMicroListItem | null>(
          items.map(async (item) => {
            const fromPosted = wishMap.get(item.wishId);
            if (fromPosted) {
              return {
                wish: fromPosted,
                note: item.note,
                affiliateUrl: item.affiliateUrl,
              } as ResolvedMicroListItem;
            }
            try {
              const snap = await getDoc(doc(db, 'wishes', item.wishId));
              if (snap.exists()) {
                const wish = {
                  id: snap.id,
                  ...(snap.data() as Omit<Wish, 'id'>),
                } as Wish;
                return {
                  wish,
                  note: item.note,
                  affiliateUrl: item.affiliateUrl,
                } as ResolvedMicroListItem;
              }
            } catch (error) {
              logger.warn('Failed to fetch wish for microlist', {
                wishId: item.wishId,
                error,
              });
            }
            return null;
          }),
        );
        const filtered = results.filter(
          (entry): entry is ResolvedMicroListItem => entry !== null,
        );
        setResolvedItems(filtered);
      } finally {
        setHydrating(false);
      }
    },
    [wishMap],
  );

  useEffect(() => {
    hydrate(microList?.items).catch((error) => {
      logger.warn('Hydration error for microlist', { profileId, error });
    });
  }, [hydrate, microList?.items, profileId]);

  useEffect(() => {
    if (!microListEnabled || !profileId || !resolvedItems.length) return;
    if (hasTrackedOpen.current) return;
    trackEvent('microlist_open', {
      profile_id: profileId,
      item_count: resolvedItems.length,
      viewer_role: isOwner ? 'owner' : 'viewer',
    });
    hasTrackedOpen.current = true;
  }, [isOwner, microListEnabled, profileId, resolvedItems.length]);

  useEffect(() => {
    if (!microListEnabled || !profileId) return;
    if (resolvedItems.length > 0) return;
    if (loading || hydrating) return;
    if (hasTrackedPreview.current) return;
    trackEvent('microlist_preview_empty', {
      profile_id: profileId,
      viewer_role: isOwner ? 'owner' : 'viewer',
    });
    hasTrackedPreview.current = true;
  }, [
    hydrating,
    isOwner,
    loading,
    microListEnabled,
    profileId,
    resolvedItems.length,
  ]);

  const openEditor = useCallback(() => {
    if (!microListEnabled || !isOwner) return;
    const items = microList?.items ?? [];
    setDraftTitle(microList?.title ?? 'My Wish Picks');
    setDraftCover(microList?.coverUrl ?? '');
    setDraftItems(
      items.map((item, index) => ({
        ...item,
        key: `${item.wishId}-${index}`,
      })),
    );
    trackEvent('microlist_edit_open', {
      profile_id: profileId ?? undefined,
      item_count: items.length,
    });
    setEditorVisible(true);
  }, [
    isOwner,
    microList?.coverUrl,
    microList?.items,
    microList?.title,
    microListEnabled,
    profileId,
  ]);

  const availableWishes = useMemo(() => {
    const selected = new Set(draftItems.map((item) => item.wishId));
    return postedWishes.filter((wish) => !selected.has(wish.id));
  }, [draftItems, postedWishes]);

  const handleAddWish = useCallback(
    (wish: Wish) => {
      if (draftItems.length >= MAX_ITEMS) return;
      const nextItems: DraftItem[] = [
        ...draftItems,
        {
          wishId: wish.id,
          order: draftItems.length,
          note: '',
          affiliateUrl: '',
          key: `${wish.id}-${Date.now()}`,
        },
      ];
      setDraftItems(nextItems);
      trackEvent('microlist_edit_add_item', {
        profile_id: profileId ?? undefined,
        wish_id: wish.id,
        item_count: nextItems.length,
      });
    },
    [draftItems, profileId],
  );

  const handleRemoveWish = useCallback(
    (wishId: string) => {
      const nextItems = draftItems.filter((item) => item.wishId !== wishId);
      if (nextItems.length === draftItems.length) return;
      setDraftItems(nextItems);
      trackEvent('microlist_edit_remove_item', {
        profile_id: profileId ?? undefined,
        wish_id: wishId,
        item_count: nextItems.length,
      });
    },
    [draftItems, profileId],
  );

  const handleSave = useCallback(async () => {
    if (!profileId) return;
    setSaving(true);
    try {
      const normalizedItems: MicroListItem[] = draftItems.map(
        (item, index) => ({
          wishId: item.wishId,
          order: index,
          note: item.note?.trim()
            ? item.note.trim().slice(0, NOTE_MAX)
            : undefined,
          affiliateUrl: item.affiliateUrl?.trim()
            ? item.affiliateUrl.trim()
            : undefined,
        }),
      );
      const payload: Omit<MicroList, 'updatedAt'> = {
        title: draftTitle.trim()
          ? draftTitle.trim().slice(0, TITLE_MAX)
          : 'My Wish Picks',
        coverUrl: draftCover.trim() ? draftCover.trim() : undefined,
        items: normalizedItems,
      };
      await persist(payload);
      trackEvent('microlist_edit_save', {
        profile_id: profileId ?? undefined,
        item_count: normalizedItems.length,
      });
      setEditorVisible(false);
    } catch (error) {
      logger.warn('Failed to save micro list', { error, profileId });
    } finally {
      setSaving(false);
    }
  }, [draftCover, draftItems, draftTitle, persist, profileId]);

  const renderSelectedItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<DraftItem>) => {
      const wish = wishMap.get(item.wishId) ?? resolvedWishMap.get(item.wishId);
      const currentIndex =
        getIndex?.() ?? draftItems.findIndex((entry) => entry.key === item.key);
      return (
        <TouchableOpacity
          onLongPress={drag}
          style={[
            styles.selectedItem,
            {
              borderColor: theme.placeholder,
              backgroundColor: isActive ? theme.tint + '22' : theme.background,
            },
          ]}
        >
          <View style={styles.selectedMeta}>
            <Text style={[styles.selectedTitle, { color: theme.text }]}>
              {wish?.text ?? 'Unknown wish'}
            </Text>
            <Text style={[styles.selectedHint, { color: theme.placeholder }]}>
              Drag to reorder • Position {currentIndex + 1}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleRemoveWish(item.wishId)}
            style={styles.removeButton}
            accessibilityRole="button"
            accessibilityLabel="Remove wish from micro list"
          >
            <Ionicons name="trash-outline" size={18} color={theme.tint} />
          </TouchableOpacity>
          <View style={styles.notesBlock}>
            <Text style={[styles.noteLabel, { color: theme.placeholder }]}>
              Note (optional)
            </Text>
            <TextInput
              style={[
                styles.noteInput,
                {
                  borderColor: theme.placeholder,
                  color: theme.text,
                  backgroundColor: theme.input,
                },
              ]}
              placeholder="Why this pick matters"
              placeholderTextColor={theme.placeholder}
              value={item.note ?? ''}
              maxLength={NOTE_MAX}
              onChangeText={(value) =>
                setDraftItems((prev) =>
                  prev.map((entry) =>
                    entry.key === item.key ? { ...entry, note: value } : entry,
                  ),
                )
              }
            />
          </View>
          <View style={styles.notesBlock}>
            <Text style={[styles.noteLabel, { color: theme.placeholder }]}>
              Affiliate link
            </Text>
            <TextInput
              style={[
                styles.noteInput,
                {
                  borderColor: theme.placeholder,
                  color: theme.text,
                  backgroundColor: theme.input,
                },
              ]}
              placeholder="https://"
              placeholderTextColor={theme.placeholder}
              value={item.affiliateUrl ?? ''}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) =>
                setDraftItems((prev) =>
                  prev.map((entry) =>
                    entry.key === item.key
                      ? { ...entry, affiliateUrl: value }
                      : entry,
                  ),
                )
              }
            />
          </View>
        </TouchableOpacity>
      );
    },
    [
      draftItems,
      handleRemoveWish,
      resolvedWishMap,
      theme.background,
      theme.input,
      theme.placeholder,
      theme.text,
      theme.tint,
      wishMap,
    ],
  );

  const handlePressItem = useCallback(
    (wish: Wish, index: number) => {
      if (!wish?.id) return;
      trackEvent('microlist_click_item', {
        wish_id: wish.id,
        position: index + 1,
      });
      router.push(`/wish/${wish.id}` as Href);
    },
    [router],
  );

  if (!microListEnabled || !profileId) return null;

  const hasItems = resolvedItems.length > 0;
  const showSkeleton = loading || hydrating;
  const showPlaceholder = !showSkeleton && !hasItems;
  const displayTitle = microList?.title ?? 'My Wish Picks';

  return (
    <View style={styles.container}>
      {showSkeleton ? (
        <View
          style={[
            styles.loadingCard,
            { borderColor: theme.placeholder, backgroundColor: theme.input },
          ]}
        >
          <ActivityIndicator color={theme.tint} />
        </View>
      ) : null}
      {hasItems ? (
        <MicroListCard
          title={displayTitle}
          coverUrl={microList?.coverUrl}
          items={resolvedItems}
          onPressItem={handlePressItem}
        />
      ) : null}
      {showPlaceholder ? (
        <MicroListPlaceholderCard isOwner={isOwner} title={displayTitle} />
      ) : null}
      {isOwner ? (
        <TouchableOpacity
          onPress={openEditor}
          style={[
            styles.editButton,
            { borderColor: theme.placeholder, backgroundColor: theme.input },
          ]}
        >
          <Ionicons name="sparkles-outline" size={18} color={theme.tint} />
          <Text style={[styles.editButtonText, { color: theme.text }]}>
            {microList?.items?.length ? 'Edit micro-list' : 'Create micro-list'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={editorVisible}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setEditorVisible(false)}
      >
        <View
          style={[
            styles.editorContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <View style={styles.editorHeader}>
            <TouchableOpacity onPress={() => setEditorVisible(false)}>
              <Text style={[styles.headerAction, { color: theme.placeholder }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[styles.editorTitle, { color: theme.text }]}>
              Micro-list
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={saving ? styles.headerActionDisabled : undefined}
            >
              <Text style={[styles.headerAction, { color: theme.tint }]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.editorScroll}>
            <Text style={[styles.fieldLabel, { color: theme.placeholder }]}>
              Title
            </Text>
            <TextInput
              style={[
                styles.textField,
                {
                  color: theme.text,
                  borderColor: theme.placeholder,
                  backgroundColor: theme.input,
                },
              ]}
              value={draftTitle}
              placeholder="My wish picks"
              placeholderTextColor={theme.placeholder}
              maxLength={TITLE_MAX}
              onChangeText={setDraftTitle}
            />
            <Text style={[styles.fieldLabel, { color: theme.placeholder }]}>
              Cover image URL
            </Text>
            <TextInput
              style={[
                styles.textField,
                {
                  color: theme.text,
                  borderColor: theme.placeholder,
                  backgroundColor: theme.input,
                },
              ]}
              value={draftCover}
              placeholder="https://example.com/cover.jpg"
              placeholderTextColor={theme.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setDraftCover}
            />

            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Selected wishes ({draftItems.length}/{MAX_ITEMS})
            </Text>
            {draftItems.length === 0 ? (
              <Text style={[styles.emptyHint, { color: theme.placeholder }]}>
                Add up to five wishes to spotlight them on your profile.
              </Text>
            ) : (
              <DraggableFlatList
                data={draftItems}
                keyExtractor={(item) => item.key}
                onDragEnd={({ data }) => {
                  setDraftItems(data);
                }}
                renderItem={renderSelectedItem}
                scrollEnabled={false}
              />
            )}

            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Add from your wishes
            </Text>
            <FlatList
              data={availableWishes}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.addRow, { borderColor: theme.placeholder }]}
                  onPress={() => handleAddWish(item)}
                  disabled={draftItems.length >= MAX_ITEMS}
                >
                  <View style={styles.addRowMeta}>
                    <Text
                      style={[styles.addRowTitle, { color: theme.text }]}
                      numberOfLines={2}
                    >
                      {item.text}
                    </Text>
                    <Text
                      style={[
                        styles.addRowSubtitle,
                        { color: theme.placeholder },
                      ]}
                    >
                      {item.timestamp?.toDate?.()
                        ? item.timestamp.toDate().toLocaleDateString()
                        : 'Recently added'}
                    </Text>
                  </View>
                  <Ionicons
                    name="add-circle"
                    size={22}
                    color={
                      draftItems.length >= MAX_ITEMS
                        ? theme.placeholder
                        : theme.tint
                    }
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyHint, { color: theme.placeholder }]}>
                  No other wishes available right now.
                </Text>
              }
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  loadingCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
  editorContainer: {
    flex: 1,
  },
  editorHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerAction: {
    fontWeight: '600',
    fontSize: 16,
  },
  headerActionDisabled: {
    opacity: 0.5,
  },
  editorTitle: {
    fontWeight: '700',
    fontSize: 17,
  },
  editorScroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  fieldLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  textField: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 14,
  },
  selectedItem: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  selectedMeta: {
    marginBottom: 8,
  },
  selectedTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  selectedHint: {
    fontSize: 12,
  },
  removeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
  },
  notesBlock: {
    marginTop: 12,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  noteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  addRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addRowMeta: {
    flex: 1,
    gap: 6,
  },
  addRowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  addRowSubtitle: {
    fontSize: 12,
  },
  placeholderCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  placeholderCover: {
    width: '100%',
    height: 120,
    borderRadius: 16,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  placeholderSubtitle: {
    fontSize: 14,
  },
  placeholderList: {
    gap: 10,
  },
  placeholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 12,
  },
  placeholderRowMeta: {
    flex: 1,
    gap: 4,
  },
  placeholderRowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  placeholderRowNote: {
    fontSize: 13,
  },
  placeholderThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
});
