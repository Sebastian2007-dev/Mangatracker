using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace MangaTracker
{
    public class MangaEntry : INotifyPropertyChanged
    {
        private string _title = "";
        private int _chapter;
        private string _status = "";
        private string _url = "";
        private string _chapterUrlTemplate = "";
        private bool _hasNewChapter; // Backing field für die neue Eigenschaft
        public string? LatestChapterXPath { get; set; }
        public string? ChapterNumberRegex { get; set; }

        public string Title
        {
            get => _title;
            set => SetField(ref _title, value);
        }

        public int Chapter
        {
            get => _chapter;
            set => SetField(ref _chapter, value);
        }

        public string Status
        {
            get => _status;
            set => SetField(ref _status, value);
        }

        public string Url
        {
            get => _url;
            set => SetField(ref _url, value);
        }

        public string ChapterUrlTemplate
        {
            get => _chapterUrlTemplate;
            set => SetField(ref _chapterUrlTemplate, value);
        }

        // NEU: Diese Eigenschaft steuert die visuelle Hervorhebung.
        public bool HasNewChapter
        {
            get => _hasNewChapter;
            set => SetField(ref _hasNewChapter, value);
        }

        public event PropertyChangedEventHandler? PropertyChanged;

        protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        protected bool SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
        {
            if (EqualityComparer<T>.Default.Equals(field, value))
                return false;
            field = value;
            OnPropertyChanged(propertyName);
            return true;
        }
    }
}