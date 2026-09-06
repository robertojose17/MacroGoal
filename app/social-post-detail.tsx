/**
 * Social Post Detail Screen
 * Route: /social-post-detail?post_id=X
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ImageSourcePropType,
  Animated,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Heart, Send, MessageCircle } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  fetchComments,
  toggleLike,
  addComment,
  fetchFeed,
} from '@/utils/socialApi';
import type { SocialPost, Comment } from '@/utils/socialApi';

function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Avatar({ username, avatarUrl, size = 36 }: { username: string; avatarUrl: string | null; size?: number }) {
  const initial = (username ?? 'U').charAt(0).toUpperCase();
  if (avatarUrl) {
    return (
      <Image
        source={resolveImageSource(avatarUrl)}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primary + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: colors.primary }}>
        {initial}
      </Text>
    </View>
  );
}

function CommentItem({ comment, isDark, index }: { comment: Comment; isDark: boolean; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay: index * 40, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, delay: index * 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const bg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const timeText = timeAgo(comment.created_at);

  return (
    <Animated.View
      style={[
        styles.commentCard,
        { backgroundColor: bg, borderColor },
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Avatar username={comment.author?.username ?? 'U'} avatarUrl={comment.author?.avatar_url ?? null} size={32} />
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentUsername, { color: textColor }]}>
            {comment.author?.username ?? 'Unknown'}
          </Text>
          <Text style={[styles.commentTime, { color: subColor }]}>{timeText}</Text>
        </View>
        <Text style={[styles.commentContent, { color: textColor }]}>{comment.content}</Text>
      </View>
    </Animated.View>
  );
}

export default function SocialPostDetailScreen() {
  const { post_id } = useLocalSearchParams<{ post_id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [post, setPost] = useState<SocialPost | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const inputBg = isDark ? colors.cardDark : colors.card;

  // Load post from feed (single post lookup via feed)
  useEffect(() => {
    if (!post_id) return;
    console.log('[PostDetail] Loading post — post_id:', post_id);
    setPostLoading(true);
    fetchFeed(50, 0)
      .then((posts) => {
        const found = posts.find((p) => p.id === post_id) ?? null;
        console.log('[PostDetail] Post found:', !!found);
        setPost(found);
      })
      .catch((e) => console.error('[PostDetail] Failed to load post:', e))
      .finally(() => setPostLoading(false));
  }, [post_id]);

  // Load comments
  useEffect(() => {
    if (!post_id) return;
    console.log('[PostDetail] Loading comments — post_id:', post_id);
    setCommentsLoading(true);
    fetchComments(post_id)
      .then((data) => {
        console.log('[PostDetail] Loaded', data.length, 'comments');
        setComments(data);
      })
      .catch((e) => console.error('[PostDetail] Failed to load comments:', e))
      .finally(() => setCommentsLoading(false));
  }, [post_id]);

  const handleLike = useCallback(async () => {
    if (!post) return;
    console.log('[PostDetail] Like pressed — post_id:', post.id, 'currently liked:', post.liked_by_me);
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 8 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }),
    ]).start();
    setPost((prev) =>
      prev
        ? {
            ...prev,
            liked_by_me: !prev.liked_by_me,
            likes_count: prev.liked_by_me ? prev.likes_count - 1 : prev.likes_count + 1,
          }
        : prev
    );
    try {
      const result = await toggleLike(post.id);
      setPost((prev) =>
        prev ? { ...prev, liked_by_me: result.liked, likes_count: result.likes_count } : prev
      );
    } catch (e) {
      console.error('[PostDetail] toggleLike failed:', e);
      setPost((prev) =>
        prev
          ? {
              ...prev,
              liked_by_me: !prev.liked_by_me,
              likes_count: prev.liked_by_me ? prev.likes_count - 1 : prev.likes_count + 1,
            }
          : prev
      );
    }
  }, [post]);

  const handleSubmitComment = useCallback(async () => {
    if (!post_id || !commentText.trim()) return;
    console.log('[PostDetail] Submit comment — post_id:', post_id, 'length:', commentText.trim().length);
    setSubmitting(true);
    try {
      const newComment = await addComment(post_id, commentText.trim());
      console.log('[PostDetail] Comment added — id:', newComment.id);
      setComments((prev) => [...prev, newComment]);
      setCommentText('');
      setPost((prev) =>
        prev ? { ...prev, comments_count: prev.comments_count + 1 } : prev
      );
    } catch (e) {
      console.error('[PostDetail] addComment failed:', e);
    } finally {
      setSubmitting(false);
    }
  }, [post_id, commentText]);

  const likeColor = post?.liked_by_me ? '#EF4444' : subColor;
  const likesCount = post?.likes_count ?? 0;
  const commentsCount = post?.comments_count ?? 0;
  const timeText = post ? timeAgo(post.created_at) : '';

  const renderHeader = () => {
    if (postLoading) {
      return (
        <View style={[styles.postCard, { backgroundColor: cardBg, borderColor }]}>
          <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} />
        </View>
      );
    }
    if (!post) {
      return (
        <View style={[styles.postCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.errorText, { color: subColor }]}>Post not found.</Text>
        </View>
      );
    }
    return (
      <View style={[styles.postCard, { backgroundColor: cardBg, borderColor }]}>
        {/* Author */}
        <View style={styles.postHeader}>
          <Avatar username={post.author?.username ?? 'U'} avatarUrl={post.author?.avatar_url ?? null} size={44} />
          <View style={styles.postHeaderInfo}>
            <Text style={[styles.postUsername, { color: textColor }]}>
              {post.author?.username ?? 'Unknown'}
            </Text>
            <Text style={[styles.postTime, { color: subColor }]}>{timeText}</Text>
          </View>
        </View>

        {/* Content */}
        {post.content ? (
          <Text style={[styles.postContent, { color: textColor }]}>{post.content}</Text>
        ) : null}

        {/* Image */}
        {post.image_url ? (
          <Image
            source={resolveImageSource(post.image_url)}
            style={styles.postImage}
            resizeMode="cover"
          />
        ) : null}

        {/* Actions */}
        <View style={[styles.postActions, { borderTopColor: borderColor }]}>
          <Pressable
            onPress={handleLike}
            style={styles.actionBtn}
            accessibilityLabel="Like post"
            accessibilityRole="button"
          >
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Heart
                size={22}
                color={likeColor}
                fill={post.liked_by_me ? '#EF4444' : 'transparent'}
              />
            </Animated.View>
            <Text style={[styles.actionCount, { color: subColor }]}>{likesCount}</Text>
          </Pressable>
          <View style={styles.actionBtn}>
            <MessageCircle size={22} color={subColor} />
            <Text style={[styles.actionCount, { color: subColor }]}>{commentsCount}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Post',
          headerBackButtonDisplayMode: 'minimal',
          headerShown: true,
        }}
      />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <CommentItem comment={item} isDark={isDark} index={index} />
          )}
          ListHeaderComponent={
            <>
              {renderHeader()}
              <Text style={[styles.commentsLabel, { color: subColor }]}>
                {commentsLoading ? 'Loading comments...' : `${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
              </Text>
            </>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* Comment input */}
        <View style={[styles.commentInputRow, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
          <TextInput
            style={[styles.commentInput, { backgroundColor: inputBg, borderColor, color: textColor }]}
            placeholder="Add a comment..."
            placeholderTextColor={subColor}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={300}
            returnKeyType="send"
            onSubmitEditing={handleSubmitComment}
          />
          <Pressable
            onPress={handleSubmitComment}
            disabled={!commentText.trim() || submitting}
            style={[
              styles.sendBtn,
              { opacity: !commentText.trim() || submitting ? 0.4 : 1 },
            ]}
            accessibilityLabel="Send comment"
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 20,
    paddingTop: spacing.md,
  },
  postCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  postHeaderInfo: {
    flex: 1,
  },
  postUsername: {
    fontSize: 16,
    fontWeight: '700',
  },
  postTime: {
    fontSize: 13,
    marginTop: 2,
  },
  postContent: {
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.lg,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingVertical: 4,
  },
  actionCount: {
    fontSize: 15,
    fontWeight: '500',
  },
  commentsLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  commentCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  commentBody: {
    flex: 1,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 3,
  },
  commentUsername: {
    fontSize: 13,
    fontWeight: '600',
  },
  commentTime: {
    fontSize: 12,
  },
  commentContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    textAlign: 'center',
    padding: spacing.lg,
    fontSize: 14,
  },
});
