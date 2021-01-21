import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormGroup, FormControl, Validators } from '@angular/forms';

interface SendResponse {
  hash: string
}

@Component({
  selector: 'request-form',
  templateUrl: './request-form.component.html',
  styleUrls: ['./request-form.component.sass']
})
export class RequestFormComponent implements OnInit {

  applyForm: FormGroup
  message: string
  loading: boolean

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.applyForm = new FormGroup({
      captcha: new FormControl(null, [
        Validators.required
      ]),
      email: new FormControl(null, [
        Validators.required,
        Validators.email
      ]),
      address: new FormControl(null, [
        Validators.required,
        Validators.pattern(/^[a-z][a-z0-9-.]{0,63}$/)
      ]),
    });
  }

  reset(){
    this.applyForm.reset()
  }

  onSubmit() {
    this.loading=true
    this.http.post('/api/send', this.applyForm.value).subscribe((res:SendResponse) => {
      this.message = `We send you some testnet DNA with transaction ${res.hash}. Go change the world!`
      console.log(res)
      this.loading=false
      this.reset()
    }, res => {
      console.error(res)
      this.message = res.error
      this.loading=false
    })
  }

}
