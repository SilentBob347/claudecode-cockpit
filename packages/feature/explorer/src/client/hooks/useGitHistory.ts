import { useState, useCallback, useRef } from 'react';
import { buildGitFileTree, collectGitTreeDirPaths, type GitFileNode } from '../GitFileTree';
import type { Branch, Commit, FileChange, FileDiff } from '../fileBrowser/types';
import { COMMITS_PER_PAGE } from '../fileBrowser/utils';
import i18n from '@cockpit/shared-i18n';
import { Effect } from 'effect';
import { BrowserRuntime } from '@cockpit/effect-runtime';
import {
  fetchBranches,
  fetchCommits,
  fetchCommitDiff,
  fetchBranchDiff,
  type BranchDiffMode,
} from '../effect/gitClient';

interface UseGitHistoryOptions {
  cwd: string;
  addToRecentFiles: (path: string) => Promise<void>;
}

export function useGitHistory({ cwd, addToRecentFiles }: UseGitHistoryOptions) {
  const [branches, setBranches] = useState<Branch | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [historyFiles, setHistoryFiles] = useState<FileChange[]>([]);
  const [historyFileTree, setHistoryFileTree] = useState<GitFileNode<unknown>[]>([]);
  const [historyExpandedPaths, setHistoryExpandedPaths] = useState<Set<string>>(new Set());
  const [historySelectedFile, setHistorySelectedFile] = useState<FileChange | null>(null);
  const [historyFileDiff, setHistoryFileDiff] = useState<FileDiff | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreCommits, setHasMoreCommits] = useState(true);
  const [isLoadingHistoryFiles, setIsLoadingHistoryFiles] = useState(false);
  const [isLoadingHistoryDiff, setIsLoadingHistoryDiff] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const commitListRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Branch comparison mode
  // HEAD end is always the real git HEAD (branches.current); only the base end is user-selectable.
  const [compareMode, setCompareMode] = useState(false);
  const [upstreamBranch, setUpstreamBranch] = useState<string>(''); // Upstream of the current branch
  const [compareBaseBranch, setCompareBaseBranch] = useState<string>(''); // Base branch to compare HEAD against
  const [compareFiles, setCompareFiles] = useState<FileChange[]>([]);
  const [compareFileTree, setCompareFileTree] = useState<GitFileNode<unknown>[]>([]);
  const [compareExpandedPaths, setCompareExpandedPaths] = useState<Set<string>>(new Set());
  const [compareSelectedFile, setCompareSelectedFile] = useState<FileChange | null>(null);
  const [compareFileDiff, setCompareFileDiff] = useState<FileDiff | null>(null);
  const [isLoadingCompareFiles, setIsLoadingCompareFiles] = useState(false);
  const [isLoadingCompareDiff, setIsLoadingCompareDiff] = useState(false);
  /** 'worktree' (default) folds uncommitted work into the comparison; 'head'
   *  is the committed-only, GitHub-style diff. See branch-diff.ts. */
  const [compareDiffMode, setCompareDiffModeState] = useState<BranchDiffMode>('worktree');

  // The file watcher refreshes the comparison through a callback created once
  // (deps [cwd]), so every value it needs is read from a ref rather than closed
  // over — otherwise a refresh would keep using the first render's base branch.
  const compareModeRef = useRef(compareMode);
  compareModeRef.current = compareMode;
  const compareDiffModeRef = useRef(compareDiffMode);
  compareDiffModeRef.current = compareDiffMode;
  const compareBaseBranchRef = useRef(compareBaseBranch);
  compareBaseBranchRef.current = compareBaseBranch;
  const compareSelectedFileRef = useRef(compareSelectedFile);
  compareSelectedFileRef.current = compareSelectedFile;

  const loadBranches = useCallback(() => {
    setIsLoadingBranches(true);
    setHistoryError(null);
    BrowserRuntime.runPromise(
      fetchBranches(cwd).pipe(
        Effect.match({
          onSuccess: (data) => {
            if (data.local && data.current) {
              setBranches(data as Branch);
              setSelectedBranch(data.current);
              if (data.upstream) setUpstreamBranch(data.upstream);
            } else {
              setHistoryError(i18n.t('git.cannotGetBranches'));
              setBranches(null);
            }
          },
          onFailure: (err) => {
            console.error(err);
            if (err._tag === 'NotFoundError') {
              setHistoryError(i18n.t('git.notGitRepo'));
            } else {
              setHistoryError(i18n.t('git.getBranchesFailed'));
            }
            setBranches(null);
          },
        })
      )
    ).finally(() => setIsLoadingBranches(false));
  }, [cwd]);

  const loadCommits = useCallback((branch: string) => {
    setIsLoadingCommits(true);
    setSelectedCommit(null);
    setHistoryFiles([]);
    setHistoryFileTree([]);
    setHistorySelectedFile(null);
    setHistoryFileDiff(null);
    setHasMoreCommits(true);
    BrowserRuntime.runPromise(
      fetchCommits(cwd, branch, COMMITS_PER_PAGE).pipe(
        Effect.match({
          onSuccess: (data) => {
            const newCommits = (data.commits || []) as Commit[];
            setCommits(newCommits);
            setHasMoreCommits(newCommits.length >= COMMITS_PER_PAGE);
          },
          onFailure: (err) => {
            console.error(err);
          },
        })
      )
    ).finally(() => setIsLoadingCommits(false));
  }, [cwd]);

  const loadMoreCommits = useCallback(() => {
    if (isLoadingMore || !hasMoreCommits || !selectedBranch) return;

    setIsLoadingMore(true);
    const offset = commits.length;

    BrowserRuntime.runPromise(
      fetchCommits(cwd, selectedBranch, COMMITS_PER_PAGE, offset).pipe(
        Effect.match({
          onSuccess: (data) => {
            const newCommits = (data.commits || []) as Commit[];
            if (newCommits.length > 0) {
              setCommits(prev => [...prev, ...newCommits]);
            }
            setHasMoreCommits(newCommits.length >= COMMITS_PER_PAGE);
          },
          onFailure: (err) => {
            console.error(err);
          },
        })
      )
    ).finally(() => setIsLoadingMore(false));
  }, [cwd, selectedBranch, commits.length, isLoadingMore, hasMoreCommits]);

  const handleCommitListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadMoreCommits();
    }
  }, [loadMoreCommits]);

  const handleSelectCommit = useCallback((commit: Commit) => {
    setSelectedCommit(commit);
    setHistorySelectedFile(null);
    setHistoryFileDiff(null);
    setIsLoadingHistoryFiles(true);
    BrowserRuntime.runPromise(
      fetchCommitDiff(cwd, commit.hash).pipe(
        Effect.match({
          onSuccess: (data) => {
            const fileList = (data.files || []) as FileChange[];
            setHistoryFiles(fileList);
            const tree = buildGitFileTree(fileList);
            setHistoryFileTree(tree);
            setHistoryExpandedPaths(new Set(collectGitTreeDirPaths(tree)));
          },
          onFailure: (err) => {
            console.error(err);
          },
        })
      )
    ).finally(() => setIsLoadingHistoryFiles(false));
  }, [cwd]);

  const handleSelectHistoryFile = useCallback((file: FileChange) => {
    if (!selectedCommit) return;
    setHistorySelectedFile(file);
    addToRecentFiles(file.path);
    setIsLoadingHistoryDiff(true);
    BrowserRuntime.runPromise(
      fetchCommitDiff(cwd, selectedCommit.hash, file.path).pipe(
        Effect.match({
          onSuccess: (data) => setHistoryFileDiff(data as unknown as FileDiff),
          onFailure: (err) => {
            console.error(err);
          },
        })
      )
    ).finally(() => setIsLoadingHistoryDiff(false));
  }, [cwd, selectedCommit, addToRecentFiles]);

  const handleHistoryToggle = useCallback((path: string) => {
    setHistoryExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Load the file list for branch comparison
  const loadCompareFiles = useCallback((baseBranch: string, mode?: BranchDiffMode) => {
    setIsLoadingCompareFiles(true);
    setCompareSelectedFile(null);
    setCompareFileDiff(null);
    BrowserRuntime.runPromise(
      fetchBranchDiff(cwd, baseBranch, undefined, mode ?? compareDiffModeRef.current).pipe(
        Effect.match({
          onSuccess: (data) => {
            const fileList = (data.files || []) as FileChange[];
            setCompareFiles(fileList);
            const tree = buildGitFileTree(fileList);
            setCompareFileTree(tree);
            setCompareExpandedPaths(new Set(collectGitTreeDirPaths(tree)));
          },
          onFailure: (err) => {
            console.error(err);
          },
        })
      )
    ).finally(() => setIsLoadingCompareFiles(false));
  }, [cwd]);

  // Select a comparison file to view its diff
  const handleSelectCompareFile = useCallback((file: FileChange) => {
    setCompareSelectedFile(file);
    addToRecentFiles(file.path);
    setIsLoadingCompareDiff(true);
    BrowserRuntime.runPromise(
      fetchBranchDiff(cwd, compareBaseBranch, file.path, compareDiffModeRef.current).pipe(
        Effect.match({
          onSuccess: (data) => setCompareFileDiff(data as unknown as FileDiff),
          onFailure: (err) => {
            console.error(err);
          },
        })
      )
    ).finally(() => setIsLoadingCompareDiff(false));
  }, [cwd, compareBaseBranch, addToRecentFiles]);

  /**
   * Re-pull the comparison after the working tree changed. Only meaningful in
   * worktree mode — a committed-only diff cannot move while nobody commits,
   * and refetching it on every keystroke-triggered save would be pure noise.
   *
   * Unlike loadCompareFiles this keeps the current selection: the user is
   * usually staring at one file's diff while an agent edits it, and dropping
   * the selection on every save would make that pane unusable.
   */
  const refreshCompare = useCallback(() => {
    if (!compareModeRef.current) return;
    if (compareDiffModeRef.current !== 'worktree') return;
    const baseBranch = compareBaseBranchRef.current;
    if (!baseBranch) return;

    BrowserRuntime.runPromise(
      fetchBranchDiff(cwd, baseBranch, undefined, 'worktree').pipe(
        Effect.match({
          onSuccess: (data) => {
            const fileList = (data.files || []) as FileChange[];
            setCompareFiles(fileList);
            const tree = buildGitFileTree(fileList);
            setCompareFileTree(tree);
            // Newly appeared directories start expanded; anything the user
            // collapsed by hand is left alone.
            setCompareExpandedPaths(prev => {
              const next = new Set(prev);
              for (const dir of collectGitTreeDirPaths(tree)) {
                if (!prev.has(dir)) next.add(dir);
              }
              return next;
            });
          },
          onFailure: (err) => console.error(err),
        })
      )
    );

    const selected = compareSelectedFileRef.current;
    if (!selected) return;
    BrowserRuntime.runPromise(
      fetchBranchDiff(cwd, baseBranch, selected.path, 'worktree').pipe(
        Effect.match({
          onSuccess: (data) => setCompareFileDiff(data as unknown as FileDiff),
          onFailure: (err) => console.error(err),
        })
      )
    );
  }, [cwd]);

  /** Switch the comparison between committed-only and working-tree. */
  const setCompareDiffMode = useCallback((mode: BranchDiffMode) => {
    if (compareDiffModeRef.current === mode) return;
    compareDiffModeRef.current = mode;
    setCompareDiffModeState(mode);
    const baseBranch = compareBaseBranchRef.current;
    if (compareModeRef.current && baseBranch) loadCompareFiles(baseBranch, mode);
  }, [loadCompareFiles]);

  // Toggle directory expansion in comparison mode
  const handleCompareToggle = useCallback((path: string) => {
    setCompareExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Toggle comparison mode
  // HEAD end is always branches.current (read-only); only base end is selectable.
  const toggleCompareMode = useCallback((enabled: boolean) => {
    setCompareMode(enabled);
    if (enabled) {
      const baseBranch = 'origin/main';
      setCompareBaseBranch(baseBranch);
      loadCompareFiles(baseBranch);
    } else {
      setCompareFiles([]);
      setCompareFileTree([]);
      setCompareSelectedFile(null);
      setCompareFileDiff(null);
      setCompareBaseBranch('');
    }
  }, [upstreamBranch, loadCompareFiles]);

  const handleCommitInfoMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCommitInfoMouseLeave = useCallback(() => {
    setTooltipPos(null);
  }, []);

  return {
    branches,
    selectedBranch,
    setSelectedBranch,
    commits,
    setCommits,
    selectedCommit,
    setSelectedCommit,
    historyFiles,
    historyFileTree,
    historyExpandedPaths,
    historySelectedFile,
    historyFileDiff,
    isLoadingBranches,
    isLoadingCommits,
    isLoadingMore,
    hasMoreCommits,
    setHasMoreCommits,
    isLoadingHistoryFiles,
    isLoadingHistoryDiff,
    historyError,
    commitListRef,
    tooltipPos,
    loadBranches,
    loadCommits,
    loadMoreCommits,
    handleCommitListScroll,
    handleSelectCommit,
    handleSelectHistoryFile,
    handleHistoryToggle,
    handleCommitInfoMouseMove,
    handleCommitInfoMouseLeave,
    // Branch comparison mode
    compareMode,
    toggleCompareMode,
    compareBaseBranch,
    setCompareBaseBranch,
    upstreamBranch,
    compareFiles,
    compareFileTree,
    compareExpandedPaths,
    compareSelectedFile,
    compareFileDiff,
    isLoadingCompareFiles,
    isLoadingCompareDiff,
    handleSelectCompareFile,
    handleCompareToggle,
    loadCompareFiles,
    compareDiffMode,
    setCompareDiffMode,
    refreshCompare,
  };
}
