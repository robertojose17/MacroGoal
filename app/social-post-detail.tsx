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
  Animated,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  fetchComments,
  toggleLike,
  addComment,
  fetchFeed,
} from '@/utils/socialApi';
import type { SocialPost, Comment } from '@/utils/socialApi';
import SocialPostCard, { timeAgo } from '@/components/social/SocialPostCard';
import Avatar from '@/components/social/Avatar';

function CommentItem({
  comment,
  isDark,
  index,
}: {
  comment: Comment;
  isDark: boolean;
  index: number;
}) {
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
  const bg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const authorUsername = comment.author?.username ?? 'Unknown';
  const timeText = timeAgo(comment.created_at);

  return (
    <Animated.View
      style={[
        styles.commentCard,
        { backgroundColor: bg, borderColor },
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Pressable
        onPress={() => console.log('[PostDetail] Comment author pressed — user_id:', comment.author?.id)}
        accessibilityRole="button"
      >
        <Avatar username={authorUsername} size={32} />
      </Pressable>
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentUsername, { color: textColor }]}>{authorUsername}</Text>
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
  const router = useRouter();

  const [post, setPost] = useState<SocialPost | null>(null);
  const [postLoading, setPostLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  // Load post
  useEffect(() => {
    if (!post_id) return;
    console.log('[PostDetail] Loading post — post_id:', post_id);
    setPostLoading(true);
    fetchFeed('following', 50, 0)
      .then((posts) => {
        const found = posts.find((p) => p.id === post_id) ?? null;
        if (!found) {
          // Try discover feed
          return fetchFeed('discover', 50, 0).then((discoverPosts) => {
            const foundInDiscover = discoverPosts.find((p) => p.id === post_id) ?? null;
            console.log('[PostDetail] Post found in discover:', !!foundInDiscover);
            setPost(foundInDiscover);
          });
        }
        console.log('[PostDetail] Post found in following feed:', !!found);
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

  const handleLike = useCallback(async (postId: string) => {
    console.log('[PostDetail] Like pressed — post_id:', postId);
    setPost((prev) =>
      prev
        ? { ...prev, liked_by_me: !prev.liked_by_me, likes_count: prev.liked_by_me ? prev.likes_count - 1 : prev.likes_count + 1 }
        : prev
    );
    try {
      const result = await toggleLike(postId);
      setPost((prev) =>
        prev ? { ...prev, liked_by_me: result.liked, likes_count: result.likes_count } : prev
      );
    } catch (e) {
      console.error('[PostDetail] toggleLike failed:', e);
      setPost((prev) =>
        prev
          ? { ...prev, liked_by_me: !prev.liked_by_me, likes_count: prev.liked_by_me ? prev.likes_count - 1 : prev.likes_count + 1 }
          : prev
      );
    }
  }, []);

  const handleSubmitComment = useCallback(async () => {
    if (!post_id || !commentText.trim()) return;
    console.log('[PostDetail] Submit comment pressed — post_id:', post_id, 'length:', commentText.trim().length);
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

  const commentsCountText = commentsLoading
    ? 'Loading comments...'
    : `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`;

  const renderHeader = () => {
    if (postLoading) {
      return (
        <View style={[styles.loadingCard, { backgroundColor: cardBg, borderColor }]}>
          <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} />
        </View>
      );
    }
    if (!post) {
      return (
        <View style={[styles.loadingCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.errorText, { color: subColor }]}>Post not found.</Text>
        </View>
      );
    }
    return (
      <SocialPostCard
        post={post}
        isDark={isDark}
        onLike={handleLike}
        onPressUser={(userId) => {
          console.log('[PostDetail] Author pressed — navigating to profile user_id:', userId);
          router.push(`/social-profile?user_id=${userId}`);
        }}
        hideCommentButton
      />
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
                {commentsCountText}
              </Text>
            </>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* Comment input */}
        <View style={[styles.commentInputRow, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
          <TextInput
            style={[styles.commentInput, { backgroundColor: isDark ? '#1E2035' : colors.card, borderColor, color: textColor }]}
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
            onPress={() => {
              console.log('[PostDetail] Send comment button pressed');
              handleSubmitComment();
            }}
            disabled={!commentText.trim() || submitting}
            style={[styles.sendBtn, { opacity: !commentText.trim() || submitting ? 0.4 : 1 }]}
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
    paddingTop: spacing.sm,
  },
  loadingCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  errorText: {
    textAlign: 'center',
    padding: spacing.lg,
    fontSize: 14,
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
});
