import { Component, OnInit } from '@angular/core';
import { BlogPost, StorefrontService } from '../../services/storefront.service';

@Component({
  selector: 'app-blog-list',
  templateUrl: './blog-list.component.html',
  styleUrls: ['./blog-list.component.scss']
})
export class BlogListComponent implements OnInit {
  posts: BlogPost[] = [];

  constructor(private store: StorefrontService) {}

  ngOnInit(): void {
    this.posts = this.store.getBlogPosts();
  }
}
