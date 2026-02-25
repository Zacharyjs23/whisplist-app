import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import type { Comment } from '@/helpers/comments';
import type { Theme } from '@/contexts/ThemeContext';
import {
  CAN_USE_NATIVE_DRIVER,
  COMMENT_ITEM_HEIGHT,
  HIT_SLOP,
  emojiOptions,
} from '@/features/wishDetail/constants';
import { styles } from '@/features/wishDetail/styles';

type CommentThreadProps = {
  comments: Comment[];
  isActiveWish: boolean;
  userId?: string | null;
  wishUserId?: string;
  publicStatus: Record<string, boolean>;
  verifiedStatus: Record<string, boolean>;
  editingCommentId: string | null;
  editingCommentText: string;
  setEditingCommentId: (id: string | null) => void;
  setEditingCommentText: (text: string) => void;
  onSaveComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onReact: (commentId: string, emoji: string) => void;
  onReply: (commentId: string) => void;
  onReportComment: (commentId: string) => void;
  onOpenProfile: (displayName: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  flatListRef: React.RefObject<FlatList<Comment> | null>;
  theme: Theme;
};

export const CommentThread: React.FC<CommentThreadProps> = ({
  comments,
  isActiveWish,
  userId,
  wishUserId,
  publicStatus,
  verifiedStatus,
  editingCommentId,
  editingCommentText,
  setEditingCommentId,
  setEditingCommentText,
  onSaveComment,
  onDeleteComment,
  onReact,
  onReply,
  onReportComment,
  onOpenProfile,
  refreshing,
  onRefresh,
  flatListRef,
  theme,
}) => {
  const animationRefs = useRef<Record<string, Animated.Value>>({});
  const hydratedRef = useRef(false);

  useEffect(() => {
    const currentIds = new Set(comments.map((comment) => comment.id));
    if (!hydratedRef.current) {
      comments.forEach((comment) => {
        animationRefs.current[comment.id] = new Animated.Value(1);
      });
      hydratedRef.current = true;
      return;
    }

    comments.forEach((comment) => {
      if (animationRefs.current[comment.id]) return;
      const animValue = new Animated.Value(0);
      animationRefs.current[comment.id] = animValue;
      Animated.timing(animValue, {
        toValue: 1,
        duration: 400,
        useNativeDriver: CAN_USE_NATIVE_DRIVER,
      }).start();
    });

    Object.keys(animationRefs.current).forEach((id) => {
      if (!currentIds.has(id)) {
        delete animationRefs.current[id];
      }
    });
  }, [comments]);

  const visibleComments = useMemo(
    () => comments.filter((comment) => isActiveWish || !comment.parentId),
    [comments, isActiveWish],
  );

  const renderCommentItem = useCallback(
    (item: Comment, level = 0): React.ReactElement => {
      const animValue = animationRefs.current[item.id] ?? new Animated.Value(1);
      if (!animationRefs.current[item.id]) {
        animationRefs.current[item.id] = animValue;
      }

      const currentUser = userId || 'anon';
      const userReaction = item.userReactions?.[currentUser];
      const replies = isActiveWish
        ? comments.filter((comment) => comment.parentId === item.id)
        : [];
      const isEditing = editingCommentId === item.id;

      return (
        <View key={item.id}>
          <Animated.View
            style={{
              ...styles.commentBox,
              marginLeft: level * 16,
              opacity: animValue,
              transform: [
                {
                  translateY: animValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            }}
          >
            {!item.isAnonymous &&
            publicStatus[item.userId || ''] &&
            item.displayName ? (
              <TouchableOpacity
                onPress={() => onOpenProfile(item.displayName ?? '')}
                hitSlop={HIT_SLOP}
              >
                <Text style={[styles.nickname, { color: theme.placeholder }]}>
                  {item.displayName}
                  {verifiedStatus[item.userId || ''] ? ' ✅ Verified' : ''}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.nickname, { color: theme.placeholder }]}>
                {item.nickname || 'Anonymous'}
              </Text>
            )}
            {item.userId === wishUserId ? (
              <Text style={[styles.nickname, { color: theme.tint }]}>
                {' '}
                (author)
              </Text>
            ) : null}
            {isEditing ? (
              <>
                <TextInput
                  value={editingCommentText}
                  onChangeText={setEditingCommentText}
                  style={[
                    styles.comment,
                    {
                      color: theme.text,
                      borderWidth: 1,
                      borderColor: `${theme.text}33`,
                      borderRadius: 6,
                      padding: 4,
                    },
                  ]}
                  multiline
                />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 6,
                  }}
                >
                  <TouchableOpacity onPress={onSaveComment}>
                    <Text style={{ color: theme.tint }}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingCommentId(null);
                      setEditingCommentText('');
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    <Text style={{ color: '#f87171' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.comment, { color: theme.text }]}>
                  {item.text}
                </Text>
                <Text style={[styles.timestamp, { color: theme.placeholder }]}>
                  {item.timestamp?.seconds
                    ? formatDistanceToNow(new Date(item.timestamp.seconds * 1000), {
                        addSuffix: true,
                      })
                    : 'Just now'}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 6,
                  }}
                >
                  {emojiOptions.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => onReact(item.id, emoji)}
                      style={{
                        marginRight: 8,
                        padding: 6,
                        borderRadius: 6,
                        opacity: userReaction === emoji ? 1 : 0.4,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>
                        {emoji} {item.reactions?.[emoji] || 0}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {isActiveWish ? (
                    <TouchableOpacity
                      onPress={() => onReply(item.id)}
                      style={{ marginLeft: 8 }}
                    >
                      <Text style={{ color: '#a78bfa' }}>Reply</Text>
                    </TouchableOpacity>
                  ) : null}
                  {item.userId === userId ? (
                    <>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingCommentId(item.id);
                          setEditingCommentText(item.text);
                        }}
                        style={{ marginLeft: 8 }}
                      >
                        <Text style={{ color: theme.tint }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => onDeleteComment(item.id)}
                        style={{ marginLeft: 8 }}
                      >
                        <Text style={{ color: '#f87171' }}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                  <TouchableOpacity
                    onLongPress={() => onReportComment(item.id)}
                    style={{ marginLeft: 8 }}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={{ color: '#f87171' }}>🚩</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Animated.View>
          {replies.map((reply) => renderCommentItem(reply, level + 1))}
        </View>
      );
    },
    [
      comments,
      editingCommentId,
      editingCommentText,
      isActiveWish,
      onDeleteComment,
      onOpenProfile,
      onReact,
      onReply,
      onReportComment,
      onSaveComment,
      publicStatus,
      setEditingCommentId,
      setEditingCommentText,
      theme.placeholder,
      theme.text,
      theme.tint,
      userId,
      verifiedStatus,
      wishUserId,
    ],
  );

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => renderCommentItem(item),
    [renderCommentItem],
  );

  return (
    <FlatList
      ref={flatListRef}
      data={visibleComments}
      keyExtractor={(item) => item.id}
      renderItem={renderComment}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ paddingBottom: 80, flexGrow: 1 }}
      scrollEnabled={false}
      initialNumToRender={10}
      getItemLayout={(_, index) => ({
        length: COMMENT_ITEM_HEIGHT,
        offset: COMMENT_ITEM_HEIGHT * index,
        index,
      })}
    />
  );
};
