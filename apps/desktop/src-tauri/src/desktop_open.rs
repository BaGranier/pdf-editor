use std::path::{Path, PathBuf};

/// Both the initial invocation and later invocations use the caller's cwd.
pub fn pdf_arguments(args: impl IntoIterator<Item = impl AsRef<Path>>, cwd: &Path) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .map(|arg| cwd.join(arg.as_ref()))
        .filter(|path| super::is_pdf_path(path))
        .collect()
}

pub fn same_path(left: &Path, right: &Path) -> bool {
    #[cfg(windows)]
    {
        left.to_string_lossy().to_lowercase() == right.to_string_lossy().to_lowercase()
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

#[derive(Default)]
pub struct OpenQueue(Vec<PathBuf>);

impl OpenQueue {
    pub fn extend(&mut self, paths: Vec<PathBuf>) {
        for path in paths {
            if !self.0.iter().any(|pending| same_path(pending, &path)) {
                self.0.push(path);
            }
        }
    }

    pub fn take(&mut self) -> Vec<PathBuf> {
        std::mem::take(&mut self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_one_or_many_paths_with_spaces_and_ignores_other_arguments() {
        let cwd = std::env::current_dir().unwrap();
        assert_eq!(
            pdf_arguments(["app", "one.pdf"], &cwd),
            vec![cwd.join("one.pdf")]
        );
        assert_eq!(
            pdf_arguments(["app", "a b.PDF", "--flag", "notes.txt", "two.pdf"], &cwd),
            vec![cwd.join("a b.PDF"), cwd.join("two.pdf")]
        );
        assert!(pdf_arguments(["app", "--flag"], &cwd).is_empty());
    }

    #[test]
    fn queues_successive_batches_before_and_after_frontend_ready() {
        let mut queue = OpenQueue::default();
        queue.extend(vec!["a.pdf".into(), "b.pdf".into()]);
        queue.extend(vec!["b.pdf".into(), "c.pdf".into()]);
        assert_eq!(
            queue.take(),
            vec![PathBuf::from("a.pdf"), "b.pdf".into(), "c.pdf".into()]
        );
        assert!(queue.take().is_empty());
        queue.extend(vec!["a.pdf".into()]);
        assert_eq!(queue.take(), vec![PathBuf::from("a.pdf")]);
    }

    #[cfg(windows)]
    #[test]
    fn windows_path_identity_ignores_case() {
        assert!(same_path(
            Path::new(r"C:\Docs\A.PDF"),
            Path::new(r"c:\docs\a.pdf")
        ));
    }
}
